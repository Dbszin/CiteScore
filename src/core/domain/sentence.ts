/** Índice de uma sentença no texto extraído, base 0. */
export type SentenceId = number;

/**
 * Motivo pelo qual uma sentença não entra na análise.
 * Sentença não analisável não conta em N nem recebe classificação.
 */
export type ExclusionReason =
  | 'heading'
  | 'short'
  | 'no_verb'
  | 'list_item';

export interface Sentence {
  readonly id: SentenceId;
  readonly text: string;
  /** Offsets no texto extraído, para o highlight inline reconstruir a posição. */
  readonly start: number;
  readonly end: number;
  readonly analyzable: boolean;
  /** Preenchido quando `analyzable === false`. */
  readonly excludedReason?: ExclusionReason;
}

export function countAnalyzable(sentences: readonly Sentence[]): number {
  let total = 0;
  for (const sentence of sentences) {
    if (sentence.analyzable) total += 1;
  }
  return total;
}
