import { afterEach, describe, expect, it, vi } from 'vitest';

import { assertNotProduction } from '../../../src/adapters/config/assert-not-production.js';
import type { EnvSource } from '../../../src/adapters/config/env.js';
import { loadEnv, resetEnvCache } from '../../../src/adapters/config/env.js';

/**
 * O Reviewer apontou que `loadEnv` nunca era chamado em lugar nenhum: a
 * "validação de ambiente no boot" era promessa de comentário, não garantia.
 *
 * Ela continua sem um ponto de boot — a rota e o container são escopo do
 * componente D, que depende de ANTHROPIC_API_KEY. O que muda aqui é que o
 * COMPORTAMENTO passa a ser verificado, em vez de assumido, e o `tasks.md`
 * deixou de afirmar que a validação está ligada.
 */
afterEach(() => {
  resetEnvCache();
});

/*
 * O ambiente mínimo passou a exigir a chave do GEMINI, não a da Anthropic: o
 * default de `LLM_PROVIDER` é `gemini`, porque o produto precisa poder ficar
 * público sem custo por análise.
 */
const valido: EnvSource = { GEMINI_API_KEY: 'AIza-teste' };
const validoAnthropic: EnvSource = {
  LLM_PROVIDER: 'anthropic',
  ANTHROPIC_API_KEY: 'sk-ant-teste',
};

describe('loadEnv', () => {
  it('aceita ambiente mínimo e aplica os defaults', () => {
    const env = loadEnv(valido);
    expect(env.LLM_PROVIDER).toBe('gemini');
    expect(env.GEMINI_MODEL).toBe('gemini-2.5-flash');
    expect(env.ANTHROPIC_MODEL).toBe('claude-opus-5');
    expect(env.MAX_ANALYZABLE_SENTENCES).toBe(400);
    expect(env.RATE_LIMIT_PER_HOUR).toBe(10);
    // Era '/metodologia' — uma rota que NUNCA foi criada. O link "Ler o
    // método" no painel de resultado dava 404, e a ADR-004 item 4 exige a
    // metodologia a um clique do resultado. O default virou a seção da própria
    // página, que existe. A página dedicada segue como débito em tasks.md.
    expect(env.METHODOLOGY_URL).toBe('/#metodo');
  });

  it('LANÇA quando falta a chave do provedor escolhido', () => {
    // Default é gemini, então é a chave DELE que falta.
    expect(() => loadEnv({})).toThrow(/GEMINI_API_KEY/u);
  });

  it('exige a chave do provedor ESCOLHIDO, não das duas', () => {
    // Quem usa Gemini não precisa de credencial da Anthropic. Exigir as duas
    // pediria conta de um serviço que nunca vai ser chamado.
    expect(() => loadEnv(valido)).not.toThrow();
    resetEnvCache();
    expect(() => loadEnv(validoAnthropic)).not.toThrow();
  });

  it('LANÇA quando o provedor é anthropic e falta a chave dela', () => {
    expect(() => loadEnv({ LLM_PROVIDER: 'anthropic' })).toThrow(
      /ANTHROPIC_API_KEY/u,
    );
  });

  it('LANÇA quando o provedor não é um dos dois', () => {
    expect(() =>
      loadEnv({ ...valido, LLM_PROVIDER: 'openai' }),
    ).toThrow(/LLM_PROVIDER/u);
  });

  it('permite trocar o modelo do Gemini por variável', () => {
    // Qual modelo está na cota gratuita muda com o tempo — por isso é
    // variável, e não constante no código.
    const env = loadEnv({ ...valido, GEMINI_MODEL: 'gemini-3.5-flash' });
    expect(env.GEMINI_MODEL).toBe('gemini-3.5-flash');
  });

  it('a mensagem de erro diz o que fazer', () => {
    expect(() => loadEnv({})).toThrow(/\.env\.example/u);
  });

  it('LANÇA quando um cap numérico é inválido', () => {
    expect(() =>
      loadEnv({ ...valido, MAX_CONTENT_BYTES: 'nao-e-numero' }),
    ).toThrow(/MAX_CONTENT_BYTES/u);
  });

  it('LANÇA quando um cap é zero ou negativo', () => {
    expect(() => loadEnv({ ...valido, RATE_LIMIT_PER_HOUR: '0' })).toThrow();
    expect(() => loadEnv({ ...valido, MAX_ANALYZABLE_SENTENCES: '-1' })).toThrow();
  });

  it('converte strings numéricas em números', () => {
    const env = loadEnv({ ...valido, MAX_ANALYZABLE_SENTENCES: '250' });
    expect(env.MAX_ANALYZABLE_SENTENCES).toBe(250);
  });

  it('permite trocar o tier do modelo por variável (OQ-1)', () => {
    const env = loadEnv({ ...validoAnthropic, ANTHROPIC_MODEL: 'claude-haiku-4-5' });
    expect(env.ANTHROPIC_MODEL).toBe('claude-haiku-4-5');
  });

  it('cacheia a leitura entre chamadas', () => {
    const primeira = loadEnv(valido);
    const segunda = loadEnv({});
    expect(segunda).toBe(primeira);
  });
});

describe('assertNotProduction', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('LANÇA em produção — a proteção deixou de ser só comentário', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => {
      assertNotProduction('AllowAllRateLimiter');
    }).toThrow(/nunca deve ser montado em producao/u);
  });

  it('não interfere fora de produção', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(() => {
      assertNotProduction('AllowAllRateLimiter');
    }).not.toThrow();
  });

  it('os adapters de dev falham ao ser construídos em produção', async () => {
    const { AllowAllRateLimiter } = await import(
      '../../../src/adapters/ratelimit/allow-all-rate-limiter.js'
    );
    const { UnlimitedBudgetGuard } = await import(
      '../../../src/adapters/budget/unlimited-budget-guard.js'
    );

    vi.stubEnv('NODE_ENV', 'production');
    expect(() => new AllowAllRateLimiter()).toThrow();
    expect(() => new UnlimitedBudgetGuard()).toThrow();

    vi.stubEnv('NODE_ENV', 'test');
    expect(() => new AllowAllRateLimiter()).not.toThrow();
    expect(() => new UnlimitedBudgetGuard()).not.toThrow();
  });
});
