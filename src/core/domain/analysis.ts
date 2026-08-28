import type { Classification, Suggestion } from './classification.js';
import type { SupportedLanguage } from './extracted-content.js';
import type { Methodology } from './methodology.js';
import type { Sentence } from './sentence.js';

export interface ScoreBreakdown {
  /** N — sentenças analisáveis. */
  readonly analyzableSentences: number;
  readonly sourced: number;
  readonly unsourced: number;
  readonly opinion: number;
  /** FD = sourced / N. */
  readonly factualDensity: number;
  /** GAP = unsourced / (sourced + unsourced). `null` quando não há afirmação. */
  readonly gapRate: number | null;
  /** Fração escalada ao LLM. Observabilidade da meta de ≤50% (ADR-002). */
  readonly llmEscalationRate: number;
}

/**
 * ADR-003: ausência de score é estado de primeira classe, não `score: 0`.
 * Zero é uma medida; ausência de medida é outra coisa.
 *
 * `INCONSISTENT_INPUT` é acréscimo posterior à ADR-003 e precisa de
 * reconciliação pelo Architect (registrado no débito de spec). Ele existe
 * porque a aritmética do score pressupõe que cada sentença analisável tenha
 * no máximo uma classificação — pressuposto que o pipeline pode violar se o
 * modelo repetir um id. Sem esse estado, a violação produzia densidade de
 * 150% e score 130 numa escala de 0 a 100.
 */
export type UnscoredReason =
  | 'INSUFFICIENT_CONTENT'
  | 'NO_CLAIMS_FOUND'
  | 'INCONSISTENT_INPUT';

export type ScoreOutcome =
  | { readonly kind: 'scored'; readonly score: number }
  | { readonly kind: 'unscored'; readonly reason: UnscoredReason };

export interface Analysis {
  readonly url: string;
  readonly title: string | null;
  readonly language: SupportedLanguage;
  readonly scoreVersion: string;
  readonly outcome: ScoreOutcome;
  readonly breakdown: ScoreBreakdown;
  readonly sentences: readonly Sentence[];
  readonly classifications: readonly Classification[];
  readonly suggestions: readonly Suggestion[];
  /** `true` quando a chamada de sugestões falhou e o resto foi entregue. */
  readonly suggestionsDegraded: boolean;
  /** `true` quando o conteúdo foi truncado pelo cap de sentenças. */
  readonly truncated: boolean;
  readonly methodology: Methodology;
  readonly durationMs: number;
}
