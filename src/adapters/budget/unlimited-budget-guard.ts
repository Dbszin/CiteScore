import { assertNotProduction } from '../config/assert-not-production.js';
import type {
  BudgetDecision,
  BudgetGuard,
} from '../../core/ports/budget-guard.js';
import type { ClassifierUsage } from '../../core/ports/claim-classifier.js';
import type { CostRecorder } from '../../core/ports/cost-recorder.js';

/**
 * Adapter de DESENVOLVIMENTO E TESTE apenas.
 *
 * NUNCA deve ser montado em producao: com a estimativa de ~US$0,13 por
 * analise (ADR-005), mil requisicoes abusivas custam ~US$130. O budget guard
 * de producao e o RedisBudgetGuard, escopo de M4.
 */
export class UnlimitedBudgetGuard implements BudgetGuard {
  constructor() {
    assertNotProduction('UnlimitedBudgetGuard');
  }

  async authorize(estimatedInputTokens: number): Promise<BudgetDecision> {
    return {
      allowed: true,
      reason: 'ok',
      estimatedInputTokens,
      retryAfterSeconds: null,
    };
  }
}

/** Registrador em memoria, para inspecionar custo em teste e calibracao. */
export class InMemoryCostRecorder implements CostRecorder {
  readonly entries: { usage: ClassifierUsage; model: string }[] = [];

  async record(usage: ClassifierUsage, model: string): Promise<void> {
    this.entries.push({ usage, model });
  }
}
