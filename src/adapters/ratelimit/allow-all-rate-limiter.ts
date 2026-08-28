import { assertNotProduction } from '../config/assert-not-production.js';
import type {
  RateLimitDecision,
  RateLimiter,
} from '../../core/ports/rate-limiter.js';

/**
 * Adapter de DESENVOLVIMENTO E TESTE apenas.
 *
 * NUNCA deve ser montado em producao: rate limit e bloqueador de deploy
 * publico (specs/protecao-custo/spec.md). O adapter de producao e o
 * RedisRateLimiter, escopo de M4.
 */
export class AllowAllRateLimiter implements RateLimiter {
  constructor() {
    assertNotProduction('AllowAllRateLimiter');
  }

  async check(_clientKey: string): Promise<RateLimitDecision> {
    return { allowed: true, remaining: Number.POSITIVE_INFINITY, retryAfterSeconds: null };
  }
}
