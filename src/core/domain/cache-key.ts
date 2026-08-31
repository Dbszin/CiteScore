/**
 * A chave do cache de análise. Função pura: sem I/O, sem relógio.
 *
 * TRÊS COISAS QUE A CHAVE PRECISA FAZER, e errar qualquer uma tem custo:
 *
 * 1. **Normalizar a URL.** Se a chave for a URL crua, o cache erra quase
 *    sempre e paga-se assim mesmo. Estas quatro são o MESMO artigo:
 *      https://moz.com/learn/seo/what-is-seo
 *      https://moz.com/learn/seo/what-is-seo/
 *      https://moz.com/learn/seo/what-is-seo?utm_source=linkedin
 *      https://moz.com/learn/seo/what-is-seo#introducao
 *
 * 2. **Não normalizar demais.** `?page=2` muda o conteúdo de verdade.
 *    Descartar toda query string faria duas páginas diferentes colidirem numa
 *    chave só — e servir o artigo errado é pior que não cachear.
 *
 * 3. **Incluir a versão do score e o modelo.** Sem isso, mudar os pesos da
 *    fórmula continua servindo resultado calculado pela regra antiga. Este
 *    projeto versiona os pesos justamente porque mudá-los muda o resultado; a
 *    chave tem que respeitar esse versionamento, senão o invalida na surdina.
 *
 * A URL normalizada entra na chave em CLARO, sem hash. Chave do Redis é
 * binário-segura e comporta o tamanho, e poder ler qual URL está guardada vale
 * mais, na operação, que a economia de alguns bytes.
 */

/**
 * Parâmetros de rastreio, que não mudam o conteúdo da página.
 *
 * Lista fechada e conservadora de propósito: na dúvida, MANTER o parâmetro. O
 * erro de manter é uma entrada de cache a mais; o erro de remover é servir
 * conteúdo de outra página sob a mesma chave.
 */
const PARAMETROS_DE_RASTREIO = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'gclid',
  'gbraid',
  'wbraid',
  'fbclid',
  'msclkid',
  'twclid',
  'igshid',
  'mc_cid',
  'mc_eid',
  '_ga',
  '_gl',
  'yclid',
  'ttclid',
]);

/**
 * @throws TypeError quando a URL não é analisável — quem chama já validou a
 *   URL antes, então isto seria bug de ordem de chamada, não entrada ruim.
 */
export function normalizeUrlForCache(url: string): string {
  const parsed = new URL(url);

  // Fragmento nunca chega ao servidor: duas URLs que só diferem nele são a
  // mesma requisição.
  parsed.hash = '';

  // Host é insensível a maiúscula por especificação; o caminho NÃO é.
  parsed.hostname = parsed.hostname.toLowerCase();
  parsed.protocol = parsed.protocol.toLowerCase();

  for (const nome of [...parsed.searchParams.keys()]) {
    if (PARAMETROS_DE_RASTREIO.has(nome.toLowerCase())) {
      parsed.searchParams.delete(nome);
    }
  }

  // Ordem de parâmetro não muda a página: sem ordenar, `?a=1&b=2` e `?b=2&a=1`
  // viram duas entradas para o mesmo conteúdo.
  parsed.searchParams.sort();

  // Barra final só é descartada quando há caminho para descartar: em `/` ela
  // É o caminho.
  if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
    parsed.pathname = parsed.pathname.slice(0, -1);
  }

  return parsed.toString();
}

export interface CacheKeyParts {
  readonly url: string;
  /** Versão da fórmula do score. Mudá-la invalida o cache, e deve mesmo. */
  readonly scoreVersion: string;
  /** O modelo que classificou. Trocar de modelo troca o resultado. */
  readonly model: string;
}

export function buildAnalysisCacheKey(parts: CacheKeyParts): string {
  return [
    'analise',
    `v${parts.scoreVersion}`,
    parts.model,
    normalizeUrlForCache(parts.url),
  ].join(':');
}
