import { describe, expect, it } from 'vitest';

import { HttpContentFetcher } from '../../../src/adapters/fetch/http-content-fetcher.js';
import {
  createValidatingLookup,
  findBlockedAddressError,
  BlockedAddressError,
} from '../../../src/adapters/fetch/validating-lookup.js';
import type { AddressResolver } from '../../../src/adapters/fetch/validating-lookup.js';
import { AnalysisError } from '../../../src/core/domain/errors.js';

/**
 * Prova que a validação de endereço acontece no CAMINHO DE CONEXÃO (ADR-008).
 *
 * O risco que estes testes existem para cobrir não é a lógica de bloqueio —
 * essa já tem 53 casos em `private-address.test.ts`. É o mecanismo de pinagem
 * ser IGNORADO pelo runtime. Se o `dispatcher` não tiver efeito, a aplicação
 * continua buscando páginas normalmente e nada denuncia: comportamento
 * observável idêntico.
 *
 * Por isso nenhum teste aqui injeta transporte falso. Todos usam o transporte
 * REAL, que é o único lugar onde o lookup é de fato consultado.
 */

/** Domínio garantidamente irresolvível: `.invalid` é reservado pela RFC 2606. */
const HOST_INVALIDO = 'https://alvo-de-rebinding.invalid/artigo';

const OPTIONS = { maxBytes: 100_000, timeoutMs: 3_000, maxRedirects: 3 };

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  await expect(promise).rejects.toBeInstanceOf(AnalysisError);
  await promise.catch((error: unknown) => {
    expect((error as AnalysisError).code).toBe(code);
  });
}

describe('Pinagem de endereço — o ataque de DNS rebinding', () => {
  /**
   * O TESTE QUE DEFINE A MUDANÇA.
   *
   * O resolvedor devolve endereço público na PRIMEIRA consulta e o endpoint de
   * metadata na SEGUNDA — exatamente o que um DNS hostil faz com TTL zero.
   *
   * A pré-checagem consome a primeira e aprova. Só o lookup do caminho de
   * conexão vê a segunda.
   *
   * O oráculo é preciso: `BLOCKED_HOST` só pode acontecer se o lookup tiver
   * sido consultado. Se a pinagem fosse ignorada, o undici resolveria
   * `.invalid` pelo DNS real, falharia, e o erro seria `FETCH_FAILED`.
   */
  it('recusa quando o endereço muda entre a checagem e a conexão', async () => {
    let chamada = 0;
    const dnsHostil: AddressResolver = async () => {
      chamada += 1;
      return chamada === 1 ? ['93.184.216.34'] : ['169.254.169.254'];
    };

    const fetcher = new HttpContentFetcher(OPTIONS, dnsHostil);

    await expectCode(fetcher.fetch(HOST_INVALIDO), 'BLOCKED_HOST');

    // Duas consultas: a pré-checagem e a do socket. Se fosse uma só, a
    // validação não estaria no caminho de conexão.
    expect(chamada).toBeGreaterThanOrEqual(2);
  });

  it('o lookup é consultado durante a requisição real', async () => {
    // Sem esta observação, pinagem ignorada e pinagem funcionando produzem o
    // mesmo resultado visível.
    const vistos: string[] = [];
    const lookup = createValidatingLookup({
      resolve: async () => ['169.254.169.254'],
      onResolved: (hostname) => vistos.push(hostname),
    });

    await new Promise<void>((resolve) => {
      lookup('exemplo.test', { all: true }, (error) => {
        expect(error).toBeInstanceOf(BlockedAddressError);
        resolve();
      });
    });

    expect(vistos).toEqual(['exemplo.test']);
  });

  it('a razão do bloqueio sobrevive ao embrulho do socket', async () => {
    // O undici aninha o erro em camadas de falha de conexão. Sem desembrulhar,
    // um bloqueio de SSRF chegaria ao usuário como "não foi possível acessar".
    const original = new BlockedAddressError('alvo.test', '10.0.0.1');
    const embrulhado = new Error('fetch failed', {
      cause: new Error('connect ECONNREFUSED', { cause: original }),
    });

    expect(findBlockedAddressError(embrulhado)).toBe(original);
    expect(findBlockedAddressError(new Error('erro comum'))).toBeNull();
  });

  it('encontra o bloqueio dentro de AggregateError', async () => {
    // Happy-eyeballs agrega as tentativas por família de endereço.
    const original = new BlockedAddressError('alvo.test', '::1');
    const agregado = new AggregateError(
      [new Error('ipv4 falhou'), original],
      'todas falharam',
    );

    expect(findBlockedAddressError(agregado)).toBe(original);
  });
});

describe('Falha fechada sobre o conjunto de endereços', () => {
  it('um endereço bloqueado rejeita o hostname INTEIRO', async () => {
    // Público + privado no mesmo nome é assinatura de ataque, não configuração
    // legítima. Usar só os aprovados daria ao atacante uma segunda chance.
    const misto: AddressResolver = async () => ['93.184.216.34', '10.0.0.7'];
    const lookup = createValidatingLookup({ resolve: misto });

    await new Promise<void>((resolve) => {
      lookup('misto.test', { all: true }, (error) => {
        expect(error).toBeInstanceOf(BlockedAddressError);
        resolve();
      });
    });
  });

  it('endereço não-parseável é tratado como bloqueado', async () => {
    const lixo: AddressResolver = async () => ['nao-e-um-ip'];
    const lookup = createValidatingLookup({ resolve: lixo });

    await new Promise<void>((resolve) => {
      lookup('lixo.test', { all: true }, (error) => {
        // `classifyAddress` tem três estados justamente para que "não sei"
        // nunca signifique "liberado".
        expect(error).toBeInstanceOf(BlockedAddressError);
        resolve();
      });
    });
  });

  it('resolução vazia não vira permissão', async () => {
    const vazio: AddressResolver = async () => [];
    const lookup = createValidatingLookup({ resolve: vazio });

    await new Promise<void>((resolve) => {
      lookup('vazio.test', { all: true }, (error) => {
        expect(error).not.toBeNull();
        resolve();
      });
    });
  });

  it('falha de DNS é propagada, não engolida', async () => {
    const quebrado: AddressResolver = async () => {
      throw new Error('SERVFAIL');
    };
    const lookup = createValidatingLookup({ resolve: quebrado });

    await new Promise<void>((resolve) => {
      lookup('quebrado.test', { all: true }, (error) => {
        expect(error?.message).toBe('SERVFAIL');
        resolve();
      });
    });
  });
});

describe('Contrato do callback de resolução', () => {
  // Verificado em execução: o undici chama com `{ hints: 0, all: true }`.
  // A forma escalar existe porque `net.connect` também a usa.
  it('devolve array quando `all` é true', async () => {
    const lookup = createValidatingLookup({
      resolve: async () => ['93.184.216.34', '2606:2800:220:1:248:1893:25c8:1946'],
    });

    await new Promise<void>((resolve) => {
      lookup('ok.test', { all: true }, (error, address) => {
        expect(error).toBeNull();
        expect(address).toEqual([
          { address: '93.184.216.34', family: 4 },
          { address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 },
        ]);
        resolve();
      });
    });
  });

  it('devolve escalar com família quando `all` é false', async () => {
    const lookup = createValidatingLookup({
      resolve: async () => ['93.184.216.34'],
    });

    await new Promise<void>((resolve) => {
      lookup('ok.test', { all: false }, (error, address, family) => {
        expect(error).toBeNull();
        expect(address).toBe('93.184.216.34');
        expect(family).toBe(4);
        resolve();
      });
    });
  });
});

/**
 * Robustez do lookup.
 *
 * Nenhum destes cenários é alcançável pela fiação de produção atual —
 * `createPinnedFetch` não passa `onResolved`, e o undici não constrói grafos
 * de erro cíclicos. Estão cobertos porque isto é código de segurança, onde
 * "improvável" envelhece mal, e porque os dois modos de falha são severos:
 * um trava a conexão e derruba o processo, o outro estoura a pilha.
 */
describe('Robustez do lookup validador', () => {
  it('exceção no observador não trava a conexão nem escapa como rejeição', async () => {
    // Duas metades. Sem a primeira, o socket fica pendurado até o deadline
    // porque o callback nunca é chamado. Sem a segunda, a rejeição não tratada
    // derruba o processo no Node 20.
    const rejeicoes: unknown[] = [];
    const observador = (motivo: unknown): void => {
      rejeicoes.push(motivo);
    };
    process.on('unhandledRejection', observador);

    try {
      const lookup = createValidatingLookup({
        resolve: async () => ['93.184.216.34'],
        onResolved: () => {
          throw new Error('observador quebrou');
        },
      });

      const resultado = await new Promise<unknown>((resolve) => {
        const travou = setTimeout(() => resolve('TRAVOU'), 500);
        lookup('observador.test', { all: true }, (error) => {
          clearTimeout(travou);
          resolve(error);
        });
      });

      expect(resultado).not.toBe('TRAVOU');
      expect(resultado).toBeInstanceOf(Error);

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(rejeicoes).toEqual([]);
    } finally {
      process.off('unhandledRejection', observador);
    }
  });

  it('o callback é chamado UMA vez, mesmo quando algo falha', async () => {
    // A correção não pode introduzir uma segunda invocação no caminho de erro:
    // chamar o callback do socket duas vezes é comportamento indefinido.
    let chamadas = 0;
    const lookup = createValidatingLookup({
      resolve: async () => ['93.184.216.34'],
      onResolved: () => {
        throw new Error('quebrou');
      },
    });

    await new Promise<void>((resolve) => {
      lookup('uma-vez.test', { all: true }, () => {
        chamadas += 1;
        setTimeout(resolve, 100);
      });
    });

    expect(chamadas).toBe(1);
  });

  it('ciclo em AggregateError não estoura a pilha', () => {
    // O guarda de profundidade era por invocação, e a recursão em `errors`
    // reiniciava do zero — um grafo cíclico recorria sem fim.
    const alvo = new BlockedAddressError('alvo.test', '10.0.0.1');
    const ciclo = new AggregateError([], 'ciclo') as AggregateError & {
      errors: unknown[];
    };
    ciclo.errors = [ciclo, alvo];

    expect(findBlockedAddressError(ciclo)).toBe(alvo);
  });

  it('ciclo por `cause` também não estoura', () => {
    const raiz = new Error('raiz') as Error & { cause?: unknown };
    raiz.cause = raiz;

    expect(findBlockedAddressError(raiz)).toBeNull();
  });
});
