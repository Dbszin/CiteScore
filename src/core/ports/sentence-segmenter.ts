import type { ExtractedContent } from '../domain/extracted-content.js';
import type { Sentence } from '../domain/sentence.js';

export interface SentenceSegmenter {
  /** Deterministico e sem I/O. Marca `analyzable` por sentenca. */
  segment(content: ExtractedContent): readonly Sentence[];
}
