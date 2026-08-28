import type { Suggestion } from '../domain/classification.js';
import type { ExtractedContent } from '../domain/extracted-content.js';
import type { Sentence } from '../domain/sentence.js';
import type { ClassifierUsage } from './claim-classifier.js';

export interface SuggestionResult {
  readonly suggestions: readonly Suggestion[];
  readonly usage: ClassifierUsage | null;
}

export interface SuggestionWriter {
  /**
   * Falha aqui NAO e fatal: o caso de uso captura e marca
   * `suggestionsDegraded`. Degradacao graciosa deliberada — o relatorio
   * ainda entrega score, breakdown e highlight, que sao a maior parte do valor.
   */
  write(
    unsourced: readonly Sentence[],
    content: ExtractedContent,
  ): Promise<SuggestionResult>;
}
