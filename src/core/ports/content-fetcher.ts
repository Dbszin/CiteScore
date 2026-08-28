export interface FetchedPage {
  /** URL final, apos redirects. */
  readonly finalUrl: string;
  readonly html: string;
  readonly contentType: string;
  readonly byteLength: number;
}

export interface ContentFetcher {
  /**
   * @throws AnalysisError INVALID_URL, BLOCKED_HOST, FETCH_FAILED,
   *   FETCH_TIMEOUT, ACCESS_FORBIDDEN, NOT_HTML, CONTENT_TOO_LARGE
   */
  fetch(url: string): Promise<FetchedPage>;
}
