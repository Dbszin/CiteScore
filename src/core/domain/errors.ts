import type { ClassifierUsage } from '../ports/claim-classifier.js';

/**
 * União fechada de códigos de erro. Fechada de propósito: o mapa de status
 * HTTP na rota usa checagem de exaustividade, então adicionar um código aqui
 * sem mapeá-lo lá quebra a compilação.
 *
 * Dois códigos NÃO estavam na spec original e vêm das correções apuradas no
 * benchmark de extração (registrado como débito de spec em tasks.md):
 *  - ACCESS_FORBIDDEN: o NYT devolveu 403 e nunca chegou ao extrator. A spec
 *    mapeava paywall para NO_MAIN_CONTENT, mas o caminho real é outro.
 *  - INDEX_PAGE: a home da Folha passou com 342 "palavras" de manchetes
 *    soltas. Produzir score ali seria falha silenciosa, pior que erro.
 */
export type AnalysisErrorCode =
  // entrada
  | 'INVALID_URL'
  | 'BLOCKED_HOST'
  // fetch
  | 'FETCH_FAILED'
  | 'FETCH_TIMEOUT'
  | 'ACCESS_FORBIDDEN'
  | 'NOT_HTML'
  | 'CONTENT_TOO_LARGE'
  // extração
  | 'NO_MAIN_CONTENT'
  | 'INDEX_PAGE'
  | 'UNSUPPORTED_LANGUAGE'
  // classificação
  | 'CLASSIFIER_FAILED'
  | 'CLASSIFIER_REFUSED'
  | 'CLASSIFIER_INVALID_OUTPUT'
  | 'CLASSIFIER_QUOTA_EXHAUSTED'
  // guardas de custo
  | 'RATE_LIMITED'
  | 'BUDGET_EXCEEDED'
  | 'REQUEST_TOO_EXPENSIVE'
  | 'GUARD_UNAVAILABLE';

export class AnalysisError extends Error {
  constructor(
    readonly code: AnalysisErrorCode,
    /** Mensagem para o usuário final: acionável, sem detalhe interno. */
    readonly userMessage: string,
    override readonly cause?: unknown,
    /**
     * Segundos até valer a pena tentar de novo. `null` quando não se aplica
     * ou quando a guarda não sabe dizer.
     *
     * Existe no erro, e não só na decisão da guarda, porque é a borda HTTP
     * que precisa dele (cabeçalho `Retry-After`) e ela só recebe a exceção.
     */
    readonly retryAfterSeconds: number | null = null,
    /**
     * Uso JÁ PAGO quando a operação falhou no meio (ADR-009).
     *
     * O `ClaudeClassifier` acumula `usage` a cada lote bem-sucedido e o
     * descartava ao lançar. O dado sempre existiu — faltava carregá-lo até a
     * liquidação da reserva, que precisa saber quanto devolver.
     */
    readonly partialUsage: ClassifierUsage | null = null,
  ) {
    super(`${code}: ${userMessage}`);
    this.name = 'AnalysisError';
  }
}

export function isAnalysisError(value: unknown): value is AnalysisError {
  return value instanceof AnalysisError;
}

/**
 * Mensagens ao usuário, em um único lugar.
 *
 * NO_MAIN_CONTENT é a que mais vai aparecer na vida real e a mais fácil de
 * errar: precisa dizer POR QUE falhou e QUAL classe de página não funciona,
 * senão o usuário culpa o produto em vez de tentar outra URL.
 */
export const USER_MESSAGES: Record<AnalysisErrorCode, string> = {
  INVALID_URL: 'Informe uma URL completa, começando com https://',
  BLOCKED_HOST: 'Só é possível analisar páginas públicas na internet.',
  FETCH_FAILED:
    'Não foi possível acessar essa página. Verifique se ela abre no navegador.',
  FETCH_TIMEOUT: 'A página demorou demais para responder. Tente novamente.',
  ACCESS_FORBIDDEN:
    'Essa página bloqueou o acesso. Sites com assinatura ou proteção contra ' +
    'acesso automatizado não podem ser analisados.',
  NOT_HTML: 'Esse endereço não é uma página HTML.',
  CONTENT_TOO_LARGE: 'Essa página é maior do que o limite de análise.',
  NO_MAIN_CONTENT:
    'Não foi possível extrair o texto principal. Páginas com paywall ou que ' +
    'carregam o conteúdo por JavaScript não são suportadas.',
  INDEX_PAGE:
    'Esse endereço parece ser uma home ou página de listagem, não um artigo. ' +
    'Informe o link direto de um artigo.',
  UNSUPPORTED_LANGUAGE:
    'No momento a análise cobre apenas conteúdo em português e inglês.',
  CLASSIFIER_FAILED: 'Falha ao analisar o conteúdo. Tente novamente.',
  /*
   * Cota do provedor esgotada — distinta de CLASSIFIER_FAILED, e a distinção
   * é o ponto.
   *
   * "Tente novamente" é FALSO quando a cota acabou: tentar de novo vai falhar
   * igual, e o usuário fica clicando sem entender. Enquanto o classificador
   * rodava em tier pago essa confusão quase não aparecia; com free tier ela
   * passa a ser o modo de falha mais comum do dia.
   *
   * A mensagem não promete horário exato porque a janela de cota do provedor
   * não é necessariamente a meia-noite local de quem lê.
   */
  CLASSIFIER_QUOTA_EXHAUSTED:
    'A cota de análises deste período foi atingida. Isto não é erro seu — ' +
    'o serviço volta a analisar quando a cota renovar.',
  CLASSIFIER_REFUSED: 'Não foi possível analisar esse conteúdo.',
  CLASSIFIER_INVALID_OUTPUT:
    'Falha ao processar o resultado da análise. Tente novamente.',
  RATE_LIMITED: 'Muitas análises em pouco tempo. Aguarde um instante.',
  // Teto DIÁRIO, global e compartilhado por todos os visitantes. Não há o que
  // o usuário faça hoje além de voltar amanhã.
  BUDGET_EXCEEDED:
    'O limite diário de análises foi atingido. Tente novamente amanhã.',
  // Esta análise ESPECÍFICA é cara demais. Diferente do teto diário, tem
  // saída: trocar de artigo. Colapsar as duas numa mensagem só transformaria
  // um problema resolvível num beco aparente.
  REQUEST_TOO_EXPENSIVE:
    'Este artigo é grande demais para o limite de análise. Tente um texto mais curto.',
  GUARD_UNAVAILABLE:
    'O serviço está temporariamente indisponível. Tente novamente em instantes.',
};

export function analysisError(
  code: AnalysisErrorCode,
  cause?: unknown,
  retryAfterSeconds: number | null = null,
  partialUsage: ClassifierUsage | null = null,
): AnalysisError {
  return new AnalysisError(
    code,
    USER_MESSAGES[code],
    cause,
    retryAfterSeconds,
    partialUsage,
  );
}
