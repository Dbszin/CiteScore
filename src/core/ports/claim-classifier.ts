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
}
