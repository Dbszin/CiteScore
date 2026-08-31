import { describe, expect, it } from 'vitest';

import { escolherGuardas } from '../../../src/adapters/config/container.js';
import { FixedClock } from '../../../src/adapters/clock/system-clock.js';
import { RedisBudgetGuard } from '../../../src/adapters/budget/redis-budget-guard.js';
import { RedisRateLimiter } from '../../../src/adapters/ratelimit/redis-rate-limiter.js';
import { AllowAllRateLimiter } from '../../../src/adapters/ratelimit/allow-all-rate-limiter.js';
import { UnlimitedBudgetGuard } from '../../../src/adapters/budget/unlimited-budget-guard.js';
import { loadEnv, resetEnvCache } from '../../../src/adapters/config/env.js';

const BASE = {
  // O provedor default virou `gemini`, entao e' a chave DELE que o boot exige.
  GEMINI_API_KEY: 'chave-de-teste',
  ANTHROPIC_MODEL: 'claude-haiku-4-5',
};

function env(extra: Record<string, string> = {}) {
  resetEnvCache();
  return loadEnv({ ...BASE, ...extra });
}

/**
 * A seleção é por PRESENÇA DE CREDENCIAIS, não por `NODE_ENV`.
 *
 * Duas propriedades que a escolha por ambiente não daria: exercitar os
 * adapters reais localmente, e manter o deploy mal configurado falhando alto
 * em vez de rodar sem defesa em silêncio.
 */
describe('Seleção de guardas no container', () => {
  const clock = new FixedClock(0);

  it('com credenciais monta os adapters de Redis', () => {
    const guardas = escolherGuardas(
      env({ REDIS_URL: 'https://exemplo.upstash.io', REDIS_TOKEN: 'token-falso' }),
      clock,
    );

    expect(guardas.rateLimiter).toBeInstanceOf(RedisRateLimiter);
    expect(guardas.budgetGuard).toBeInstanceOf(RedisBudgetGuard);
  });

  it('sem credenciais monta os adapters de desenvolvimento', () => {
    const guardas = escolherGuardas(env(), clock);

    expect(guardas.rateLimiter).toBeInstanceOf(AllowAllRateLimiter);
    expect(guardas.budgetGuard).toBeInstanceOf(UnlimitedBudgetGuard);
  });

  it('credencial pela metade NÃO liga o Redis', () => {
    // URL sem token produziria cliente que falha em toda operação, e com
    // fail-closed isso derrubaria o produto inteiro. Melhor cair nos
    // adapters de dev, que lançam alto em produção.
    const guardas = escolherGuardas(
      env({ REDIS_URL: 'https://exemplo.upstash.io' }),
      clock,
    );

    expect(guardas.rateLimiter).toBeInstanceOf(AllowAllRateLimiter);
  });
});
