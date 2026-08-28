export type BudgetReason = 'ok' | 'daily_cap_reached' | 'request_too_expensive';

export interface BudgetDecision {
  readonly allowed: boolean;
  readonly reason: BudgetReason;
  readonly estimatedInputTokens: number;
  readonly retryAfterSeconds: number | null;
}

export interface BudgetGuard {
  /** Pre-flight: chamado ANTES de qualquer token ser gasto. */
  authorize(estimatedInputTokens: number): Promise<BudgetDecision>;
}
