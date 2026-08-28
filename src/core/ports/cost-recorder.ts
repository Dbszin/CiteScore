import type { ClassifierUsage } from './claim-classifier.js';

export interface CostRecorder {
  /** Registra uso real por analise. Base do acceptance criteria de M2. */
  record(usage: ClassifierUsage, model: string): Promise<void>;
}
