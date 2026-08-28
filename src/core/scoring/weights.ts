/**
 * ADR-003: ponto UNICO dos pesos do score.
 *
 * Alterar qualquer valor deste arquivo OBRIGA incrementar SCORE_VERSION.
 * Sem essa regra, um ajuste de calibracao torna silenciosamente
 * incomparaveis dois scores que o usuario vai comparar de qualquer jeito —
 * e ninguem descobre.
 *
 * Os pesos 0.6 / 0.4 sao um PONTO DE PARTIDA, nao um resultado. Sao a
 * primeira coisa que a calibracao de M2 deve questionar.
 */
export const SCORE_VERSION = '1.0.0';

export const WEIGHTS = {
  /** Peso da densidade factual: quanto do texto e afirmacao sustentada. */
  factualDensity: 0.6,
  /** Peso do complemento da lacuna: nao deixar afirmacao pendurada. */
  gapComplement: 0.4,
} as const;

/**
 * Abaixo deste numero de sentencas analisaveis nao emitimos score.
 * Score sobre texto curto e ruido apresentado como medida.
 */
export const MIN_ANALYZABLE_SENTENCES = 10;

/**
 * Limiar da guarda de pagina-indice, calibrado sobre os 7 fixtures reais.
 *
 * Vive AQUI, e nao em index-page-guard.ts, porque muda-lo muda QUAIS paginas
 * recebem score — e portanto exige incrementar SCORE_VERSION, exatamente como
 * os pesos. Manter fora deste arquivo deixava um parametro calibrado escapar
 * do regime de versionamento.
 */
export const MIN_ANALYZABLE_RATIO = 0.35;

/** Abaixo deste total de sentencas a razao acima e estatisticamente instavel. */
export const MIN_SENTENCES_FOR_RATIO = 20;
