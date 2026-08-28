import type { SentenceId } from './sentence.js';

/**
 * As três categorias do produto.
 *
 * `OPINION` não é defeito: opinião rotulada é legítima em conteúdo editorial.
 * Ela apenas dilui a densidade factual, sem penalizar o score (ADR-003).
 */
export type ClaimCategory = 'SOURCED' | 'UNSOURCED' | 'OPINION';

/**
 * Quem decidiu a classificação. Sem este campo a calibração de M2 é impossível:
 * não haveria como saber se um erro veio da regra ou do modelo (ADR-002).
 */
export type DecidedBy = 'rules' | 'llm';

/** Nome de um sinal detectado pelo pré-filtro. Vem das tabelas em signals/. */
export type SignalName = string;

export interface Classification {
  readonly sentenceId: SentenceId;
  readonly category: ClaimCategory;
  /** 0..1. Regra de alta confiança emite >= 0.9; o LLM reporta a própria. */
  readonly confidence: number;
  readonly decidedBy: DecidedBy;
  /** Sinais encontrados pelo pré-filtro. Alimenta a explicação na UI. */
  readonly signals: readonly SignalName[];
}

/**
 * Veredito do pré-filtro. Ele pode não decidir — e na maioria dos casos
 * não deve: `UNSOURCED` nunca é decidido por regra (ADR-002).
 */
export type PrefilterVerdict =
  | { readonly kind: 'decided'; readonly classification: Classification }
  | {
      readonly kind: 'escalate';
      readonly sentenceId: SentenceId;
      readonly signals: readonly SignalName[];
    };

export interface Suggestion {
  readonly sentenceId: SentenceId;
  /** O que está faltando, em linguagem de quem escreve. */
  readonly issue: string;
  /** Ação concreta de reescrita. */
  readonly action: string;
}

export function countByCategory(
  classifications: readonly Classification[],
): Record<ClaimCategory, number> {
  const counts: Record<ClaimCategory, number> = {
    SOURCED: 0,
    UNSOURCED: 0,
    OPINION: 0,
  };
  for (const classification of classifications) {
    counts[classification.category] += 1;
  }
  return counts;
}

export function countDecidedBy(
  classifications: readonly Classification[],
  decidedBy: DecidedBy,
): number {
  let total = 0;
  for (const classification of classifications) {
    if (classification.decidedBy === decidedBy) total += 1;
  }
  return total;
}
