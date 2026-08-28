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

  // Guardas de custo.
  RATE_LIMITED: 429,
  BUDGET_EXCEEDED: 429,
};
