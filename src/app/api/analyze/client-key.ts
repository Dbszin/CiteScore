import { classifyAddress } from '../../../adapters/fetch/private-address.js';

/**
 * Deriva a chave de rate limit a partir dos cabeçalhos.
 *
 * O problema: `x-forwarded-for` é escrito pelo CLIENTE quando ninguém à frente
 * o reescreve. Confiar nele cegamente daria a cada atacante um balde de rate
 * limit novo por requisição — bastaria variar o cabeçalho —, o que anula a
 * defesa sem produzir erro nenhum.
 *
 * A ordem de preferência vai do menos falsificável ao mais:
 *
 * 1. `x-vercel-forwarded-for` — escrito pela borda da Vercel, que descarta o
 *    que o cliente mandou. É o mais confiável onde este produto roda.
 * 2. `x-real-ip` — idem, escrito por proxy reverso.
 * 3. `x-forwarded-for`, mas o valor MAIS À DIREITA. A convenção é que cada
 *    proxy acrescenta ao FIM, então o último foi escrito pelo salto mais
 *    próximo de nós; os da esquerda podem ter vindo prontos do cliente.
 *
 * E o valor precisa ser um IP de verdade. Texto arbitrário aceito como chave
 * é a mesma brecha por outro caminho.
 */

const CABECALHOS_CONFIAVEIS = ['x-vercel-forwarded-for', 'x-real-ip'] as const;

/**
 * Quando não dá para identificar o cliente, todos caem no MESMO balde.
 *
 * É deliberado, e é o lado seguro: requisições não identificadas competem
 * entre si pelo mesmo limite em vez de cada uma ganhar cota própria. O custo
 * é que tráfego legítimo sem cabeçalho compartilha o teto — aceitável para
 * uma ferramenta gratuita.
 */
export const CHAVE_NAO_IDENTIFICADA = 'unknown';

function ehEnderecoValido(valor: string): boolean {
  // `classifyAddress` distingue três estados; `unparseable` é o que não tem
  // forma de endereço. Reaproveita lógica já coberta por 53 casos.
  return classifyAddress(valor) !== 'unparseable';
}

function normalizar(bruto: string | null): string | null {
  if (bruto === null) return null;
  const valor = bruto.trim();
  if (valor.length === 0 || valor.length > 64) return null;
  // IPv6 em URL vem entre colchetes; a porta é ruído para identificação.
  const semColchetes = valor.replace(/^\[|\]$/gu, '');
  return ehEnderecoValido(semColchetes) ? semColchetes : null;
}

export function clientKeyFrom(headers: Headers): string {
  for (const nome of CABECALHOS_CONFIAVEIS) {
    const valor = normalizar(headers.get(nome));
    if (valor !== null) return valor;
  }

  const encaminhados = headers.get('x-forwarded-for');
  if (encaminhados !== null) {
    const partes = encaminhados.split(',');
    // Da direita para a esquerda: o último salto é o mais próximo de nós.
    for (let i = partes.length - 1; i >= 0; i -= 1) {
      const valor = normalizar(partes[i] ?? null);
      if (valor !== null) return valor;
    }
  }

  return CHAVE_NAO_IDENTIFICADA;
}
