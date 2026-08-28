import type { Classification } from '../domain/classification.js';
import type { ExtractedContent } from '../domain/extracted-content.js';
import type { Sentence } from '../domain/sentence.js';

export interface ClassifierUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheCreationInputTokens: number;
  readonly cacheReadInputTokens: number;
}

export interface ClassificationResult {
  readonly classifications: readonly Classification[];
  /** `null` quando nada foi escalado ao LLM. */
  readonly usage: ClassifierUsage | null;
}

export interface ClaimClassifier {
  /**
   * @throws AnalysisError CLASSIFIER_FAILED, CLASSIFIER_REFUSED,
   *   CLASSIFIER_INVALID_OUTPUT
   */
  classify(
    sentences: readonly Sentence[],
    content: ExtractedContent,
  ): Promise<ClassificationResult>;

  /**
   * Pré-mede os tokens de entrada, para o `BudgetGuard` decidir ANTES de
   * gastar. Opcional porque nem todo classificador tem como contar — um
   * motor puramente local não gasta token nenhum, e um stub de teste não
   * precisa fingir que gasta.
   *
   * Quem implementa deve contar pelo provedor (`countTokens`), nunca por
   * `tiktoken`: é de outro provedor e mede outro tokenizador.
   *
   * DÉBITO DE SPEC: acréscimo posterior ao contrato de `design.md`. Sem ele
   * o pré-flight de custo não teria de onde tirar a estimativa.
   */
  estimateInputTokens?(
    sentences: readonly Sentence[],
    content: ExtractedContent,
  ): Promise<number>;
}
