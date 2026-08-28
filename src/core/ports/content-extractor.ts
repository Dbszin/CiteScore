import type { ExtractedContent } from '../domain/extracted-content.js';
import type { FetchedPage } from './content-fetcher.js';

export interface ContentExtractor {
  /**
   * @throws AnalysisError NO_MAIN_CONTENT, INDEX_PAGE, UNSUPPORTED_LANGUAGE
   */
  extract(page: FetchedPage): Promise<ExtractedContent>;
}
