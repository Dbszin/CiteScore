export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly retryAfterSeconds: number | null;
}

export interface RateLimiter {
  check(clientKey: string): Promise<RateLimitDecision>;
}
