import dns from 'node:dns/promises';

import { classifyAddress } from './private-address.js';

/**
 * Validação de endereço DENTRO do caminho de conexão (ADR-008).
 *
 * O problema que isto resolve: validar o DNS e depois entregar o hostname ao
 * `fetch` cria duas resoluções independentes. A que valida não é a que conecta,
 * e entre as duas cabe um DNS rebinding — IP público na primeira consulta,
 * 169.254.169.254 na segunda.
 *
 * Aqui a resolução e a validação são a mesma operação, e o resultado dela é a
 * ÚNICA fonte de endereços do socket. Não existe janela porque não existe
 * segunda pergunta ao DNS.
 *
 * A conexão continua sendo feita PARA O NOME: o SNI e a verificação de
 * certificado seguem usando o hostname. Só a escolha do endereço muda de fonte.
 */

/** Resolvedor injetável, para que o teste não dependa de DNS real. */
export type AddressResolver = (hostname: string) => Promise<string[]>;

export const systemResolver: AddressResolver = async (hostname) => {
  const records = await dns.lookup(hostname, { all: true });
  return records.map((record) => record.address);
};

/**
 * Marca a recusa por endereço bloqueado.
 *
 * Existe porque a rejeição acontece dentro do socket, e o erro chega ao
 * fetcher embrulhado em camadas de "connection failed". Sem esta marca, um
 * bloqueio de SSRF viraria `FETCH_FAILED` genérico — o usuário receberia
 * "não foi possível acessar a página" no lugar de "só analisamos páginas
 * públicas", e o log não distinguiria ataque de site fora do ar.
 */
export class BlockedAddressError extends Error {
  readonly isBlockedAddress = true;

  constructor(
    readonly hostname: string,
    readonly address: string,
  ) {
    super(`Endereço bloqueado para ${hostname}: ${address}`);
    this.name = 'BlockedAddressError';
  }
}

const LIMITE_DE_NOS = 64;

/** Procura a recusa dentro do erro que o undici devolve, que vem embrulhado. */
export function findBlockedAddressError(
  error: unknown,
): BlockedAddressError | null {
  // Busca em LARGURA com conjunto de visitados, e não recursão por
  // profundidade. A versão anterior contava profundidade por invocação e
  // reiniciava a contagem ao descer em `errors`, então um grafo cíclico
  // recorria sem fim — comprovado com `AggregateError` que se contém.
  //
  // O conjunto de visitados torna ciclo impossível por construção, e o limite
  // de nós protege contra grafo grande demais.
  const pendentes: unknown[] = [error];
  const vistos = new Set<object>();

  for (let passos = 0; passos < LIMITE_DE_NOS && pendentes.length > 0; passos += 1) {
    const atual = pendentes.shift();
    if (typeof atual !== 'object' || atual === null) continue;
    if (vistos.has(atual)) continue;
    vistos.add(atual);

    if ((atual as { isBlockedAddress?: boolean }).isBlockedAddress === true) {
      return atual as BlockedAddressError;
    }

    const aninhados = (atual as { errors?: unknown }).errors;
    if (Array.isArray(aninhados)) pendentes.push(...aninhados);

    const causa = (atual as { cause?: unknown }).cause;
    if (causa !== undefined) pendentes.push(causa);
  }

  return null;
}

interface LookupEntry {
  readonly address: string;
  readonly family: number;
}

type LookupCallback = (
  error: NodeJS.ErrnoException | null,
  address?: string | LookupEntry[],
  family?: number,
) => void;

interface LookupOptions {
  readonly all?: boolean;
  readonly family?: number;
}

export interface ValidatingLookupOptions {
  readonly resolve?: AddressResolver;
  /**
   * Observado a cada resolução. Torna a pinagem verificável em teste — sem
   * isto, um mecanismo de pinagem ignorado pelo runtime seria
   * indistinguível de um funcionando.
   */
  readonly onResolved?: (hostname: string, addresses: readonly string[]) => void;
}

function familyOf(address: string): number {
  return address.includes(':') ? 6 : 4;
}

export type ValidatingLookup = (
  hostname: string,
  options: LookupOptions,
  callback: LookupCallback,
) => void;

export function createValidatingLookup(
  options: ValidatingLookupOptions = {},
): ValidatingLookup {
  return (hostname, lookupOptions, callback) => {
    // O socket espera EXATAMENTE uma resposta. Duas invocações são
    // comportamento indefinido; zero deixa a conexão pendurada até o deadline.
    let respondido = false;
    const responder: LookupCallback = (error, address, family) => {
      if (respondido) return;
      respondido = true;
      callback(error, address, family);
    };

    void (async () => {
      try {
        await resolver(hostname, lookupOptions, responder, options);
      } catch (cause) {
        // Qualquer exceção aqui — inclusive vinda de `onResolved` ou do
        // próprio callback — falha FECHADA: a resolução não se completou,
        // então a conexão não pode prosseguir.
        //
        // O erro original é propagado sem ser reembrulhado num código de DNS
        // fabricado: inventar `EAI_AGAIN` para uma falha que não é de DNS
        // esconderia a causa real de quem for ler o log.
        //
        // Se a exceção veio do próprio `callback`, `responder` já marcou
        // `respondido` e esta chamada é inerte — sem dupla invocação.
        responder(cause as NodeJS.ErrnoException);
      }
    })();
  };
}

/** Corpo da resolução. Separado para que TODA saída passe pelo `try` acima. */
async function resolver(
  hostname: string,
  lookupOptions: LookupOptions,
  responder: LookupCallback,
  options: ValidatingLookupOptions,
): Promise<void> {
  const resolve = options.resolve ?? systemResolver;

  let addresses: string[];
  try {
    addresses = await resolve(hostname);
  } catch (cause) {
    responder(cause as NodeJS.ErrnoException);
    return;
  }

  options.onResolved?.(hostname, addresses);

  if (addresses.length === 0) {
    const error: NodeJS.ErrnoException = new Error(
      `Nenhum endereço para ${hostname}`,
    );
    error.code = 'ENOTFOUND';
    responder(error);
    return;
  }

  // Falha FECHADA, e sobre o conjunto inteiro. Um hostname que resolve ao
  // mesmo tempo para IP público e para 169.254.169.254 não é configuração
  // legítima: é a assinatura do ataque. Usar só os aprovados entregaria
  // ao atacante a chance de tentar de novo.
  for (const address of addresses) {
    if (classifyAddress(address) !== 'allowed') {
      responder(new BlockedAddressError(hostname, address));
      return;
    }
  }

  // O undici chama com `all: true` e espera um array — verificado em
  // execução. A forma escalar existe porque `net.connect` também a usa,
  // conforme a configuração de quem chama.
  if (lookupOptions.all === true) {
    responder(
      null,
      addresses.map((address) => ({
        address,
        family: familyOf(address),
      })),
    );
    return;
  }

  const first = addresses[0] as string;
  responder(null, first, familyOf(first));
}
