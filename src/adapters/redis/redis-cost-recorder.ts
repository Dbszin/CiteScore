import type { ClassifierUsage } from '../../core/ports/claim-classifier.js';
import type { CostRecorder } from '../../core/ports/cost-recorder.js';
import type { ModelPricing } from './pricing.js';
import { custoMicros, microsParaDolares } from './pricing.js';

export interface RedisCostRecorderOptions {
  readonly pricing: ModelPricing;
}

/**
 * Observabilidade de custo — e SÓ isso (ADR-009).
 *
 * A versão anterior também reconciliava o contador diário, e era o segundo
 * componente a escrever na mesma chave que o `BudgetGuard`. Pior: recalculava
 * a pré-cobrança a partir de `usage.inputTokens`, enquanto o que foi cobrado
 * veio de `countTokens` — números próximos, não iguais. A reconciliação
 * errava um pouco todo dia, e o arranjo de dois donos escondia o defeito.
 *
 * Agora o contador tem um dono só: quem cobra é quem liquida. Este aqui
 * registra, e é o que o nome sempre disse.
 */
export class RedisCostRecorder implements CostRecorder {
  constructor(private readonly options: RedisCostRecorderOptions) {}

  async record(usage: ClassifierUsage, model: string): Promise<void> {
    const entradaTotal =
      usage.inputTokens +
      usage.cacheCreationInputTokens +
      usage.cacheReadInputTokens;
    const real = custoMicros(entradaTotal, usage.outputTokens, this.options.pricing);

    console.info('[citescore] custo', {
      model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheReadInputTokens: usage.cacheReadInputTokens,
      custoUsd: microsParaDolares(real).toFixed(6),
    });
  }
}
