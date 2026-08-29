import type { ClassifierUsage } from './claim-classifier.js';

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

  /**
   * Fecha a reserva criada por `authorize` (ADR-009).
   *
   * OBRIGATÓRIO, e não opcional como `ClaimClassifier.estimateInputTokens`.
   * Lá a ausência degradava para uma aproximação; aqui a ausência faz a
   * pré-cobrança ficar presa e o teto se esgotar sobre gasto que nunca
   * aconteceu — sem erro nenhum. O compilador precisa cobrar.
   *
   * `estimatedInputTokens` DEVE ser o mesmo valor passado a `authorize`: o
   * guard reproduz o que cobrou aplicando a mesma função aos mesmos
   * argumentos, em vez de inferir a partir do uso real, que é outro número.
   *
   * `actualUsage` é o uso completo no sucesso, o uso PARCIAL quando a chamada
   * falhou depois de lotes já pagos, e `null` quando nada foi gasto.
   *
   * NUNCA lança. Liquidar acontece depois do trabalho: derrubar uma análise
   * concluída por falha de contabilidade trocaria valor entregue por precisão
   * de contador, e no caminho de erro mascararia a causa original.
   */
  settle(
    estimatedInputTokens: number,
    actualUsage: ClassifierUsage | null,
  ): Promise<void>;
}
