import type { AnalysisErrorCode } from '../../../core/domain/errors.js';

/**
 * Mapa único de código de erro para status HTTP.
 *
 * `Record<AnalysisErrorCode, number>` é o que dá a checagem de exaustividade:
 * adicionar um código à união sem mapeá-lo aqui não compila. Foi desenhado
 * assim de propósito — um código novo caindo em 500 por omissão é o tipo de
 * degradação que ninguém percebe.
 *
 * Vive fora de `route.ts` porque arquivos de rota do Next só aceitam um
 * conjunto fixo de exports, e este mapa precisa ser importável pelo teste.
 */
export const HTTP_STATUS: Record<AnalysisErrorCode, number> = {
  // Entrada — o cliente pode corrigir.
  INVALID_URL: 400,
  BLOCKED_HOST: 400,

  // Fetch — o problema está na página de destino, não em nós.
  FETCH_FAILED: 502,
  FETCH_TIMEOUT: 504,
  ACCESS_FORBIDDEN: 422,
  NOT_HTML: 415,
  CONTENT_TOO_LARGE: 413,

  // Extração — a URL é válida, mas o conteúdo não é analisável.
  NO_MAIN_CONTENT: 422,
  INDEX_PAGE: 422,
  UNSUPPORTED_LANGUAGE: 422,

  // Classificação — falha nossa ou do provedor; nunca culpa do usuário.
  CLASSIFIER_FAILED: 502,
  CLASSIFIER_REFUSED: 422,
  CLASSIFIER_INVALID_OUTPUT: 502,
  // 503, e nao 429, pela mesma razao de BUDGET_EXCEEDED: a cota do provedor e'
  // GLOBAL, consumida por todos os visitantes somados. Responder 429 a quem fez
  // uma unica requisicao afirma algo falso sobre o comportamento dele.
  CLASSIFIER_QUOTA_EXHAUSTED: 503,
  // Tambem 503: o servico existe e esta fora do ar por configuracao. 502
  // ("gateway ruim") culparia o provedor por um erro que e' nosso.
  CLASSIFIER_UNAVAILABLE: 503,

  // Guardas de custo.
  //
  // 429 fica onde é verdadeiro: RATE_LIMITED É por cliente.
  //
  // BUDGET_EXCEEDED passa a 503 porque o teto diário é GLOBAL — consumido por
  // todos os visitantes somados. Responder 429 ('você fez requisições demais')
  // a quem fez uma única requisição afirma algo falso sobre o comportamento
  // dele. 503 descreve o que de fato ocorre: o serviço está sem orçamento.
  RATE_LIMITED: 429,
  BUDGET_EXCEEDED: 503,
  // 413 porque o problema é o tamanho DESTA requisição, e é acionável.
  REQUEST_TOO_EXPENSIVE: 413,
  // A guarda não conseguiu decidir. 'Não sei' e 'decidi que não' são coisas
  // diferentes, e a diferença aparece no log de quem for investigar.
  GUARD_UNAVAILABLE: 503,
};
