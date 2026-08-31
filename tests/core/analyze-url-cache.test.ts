import { describe, expect, it } from 'vitest';

import { NoopAnalysisCache } from '../../src/adapters/cache/noop-analysis-cache.js';
import {
  MAX_CACHED_BYTES,
  RedisAnalysisCache,
} from '../../src/adapters/cache/redis-analysis-cache.js';
import { FakeRedisClient } from '../../src/adapters/redis/fake-redis-client.js';
import type { Analysis } from '../../src/core/domain/analysis.js';
import { buildAnalysisCacheKey } from '../../src/core/domain/cache-key.js';
import type { Clock } from '../../src/core/ports/clock.js';
import type { RedisClient } from '../../src/adapters/redis/redis-client.js';

/**
 * O que estes testes protegem NÃO é "o cache guarda coisas". É o conjunto de
 * decisões que fazem o cache não estragar o produto:
 *
 *  - falha de Redis vira "não tinha", nunca erro
 *  - resultado grande demais simplesmente não é guardado
 *  - o que voltou do Redis é conferido antes de ser confiado
 */

function relogio(agora = 1_700_000_000_000): Clock & { avancar(ms: number): void } {
  let t = agora;
  return {
    now: () => t,
    avancar(ms: number) {
      t += ms;
    },
  };
}

function analise(extra: Partial<Analysis> = {}): Analysis {
  return {
    url: 'https://exemplo.test/a',
    title: 'Artigo',
    language: 'pt-BR',
    scoreVersion: '1.0.0',
    outcome: { kind: 'scored', score: 42 },
    breakdown: {
      analyzableSentences: 2,
      sourced: 1,
      unsourced: 1,
      opinion: 0,
      factualDensity: 0.5,
      gapRate: 0.5,
      llmEscalationRate: 1,
    },
    sentences: [],
    classifications: [],
    suggestions: [],
    suggestionsDegraded: false,
    truncated: false,
    methodology: {
      kind: 'heuristic_proxy',
      measuredCitations: false,
      disclaimer: 'ressalva',
      methodologyUrl: '/#metodo',
    },
    durationMs: 1234,
    ...extra,
  };
}

const CHAVE = buildAnalysisCacheKey({
  url: 'https://exemplo.test/a',
  scoreVersion: '1.0.0',
  model: 'gemini-2.0-flash',
});

describe('RedisAnalysisCache — ida e volta', () => {
  it('guarda e devolve a mesma análise', async () => {
    const cache = new RedisAnalysisCache(new FakeRedisClient(relogio()));
    await cache.set(CHAVE, analise());

    const voltou = await cache.get(CHAVE);
    expect(voltou?.url).toBe('https://exemplo.test/a');
    expect(voltou?.outcome).toEqual({ kind: 'scored', score: 42 });
  });

  it('chave que nunca foi gravada devolve null', async () => {
    const cache = new RedisAnalysisCache(new FakeRedisClient(relogio()));
    expect(await cache.get('inexistente')).toBeNull();
  });

  it('expira depois do TTL', async () => {
    // Sem expiração, quem editou o artigo ontem receberia para sempre a
    // medição de ontem.
    const clock = relogio();
    const cache = new RedisAnalysisCache(new FakeRedisClient(clock));
    await cache.set(CHAVE, analise());

    clock.avancar(23 * 60 * 60 * 1_000);
    expect(await cache.get(CHAVE)).not.toBeNull();

    clock.avancar(2 * 60 * 60 * 1_000);
    expect(await cache.get(CHAVE)).toBeNull();
  });
});

describe('RedisAnalysisCache — falha ABERTA', () => {
  /*
   * O oposto das guardas de custo, e a diferença é deliberada. Rate limit e
   * orçamento falham FECHADOS porque deixar passar sem contar é o que o abuso
   * explora. Aqui falhar fechado transformaria o Redis fora do ar numa
   * interrupção do produto inteiro, para proteger uma economia.
   */
  it('Redis fora do ar na LEITURA vira "não tinha", não erro', async () => {
    const redis = new FakeRedisClient(relogio());
    const cache = new RedisAnalysisCache(redis);
    redis.indisponivel = true;

    await expect(cache.get(CHAVE)).resolves.toBeNull();
  });

  it('Redis fora do ar na GRAVAÇÃO não derruba nada', async () => {
    // A análise já foi feita e paga. Falhar aqui jogaria fora um resultado
    // real por causa de uma otimização.
    const redis = new FakeRedisClient(relogio());
    const cache = new RedisAnalysisCache(redis);
    redis.indisponivel = true;

    await expect(cache.set(CHAVE, analise())).resolves.toBeUndefined();
  });
});

describe('RedisAnalysisCache — o que NÃO é confiado', () => {
  function clienteQueDevolve(bruto: string | null): RedisClient {
    return {
      get: async () => bruto,
      incrBy: async () => 0,
      expire: async () => undefined,
      ttl: async () => -1,
      incrByWithTtl: async () => 0,
      setWithTtl: async () => undefined,
    };
  }

  it('JSON quebrado devolve null em vez de explodir', async () => {
    const cache = new RedisAnalysisCache(clienteQueDevolve('{nao e json'));
    expect(await cache.get(CHAVE)).toBeNull();
  });

  it('objeto sem os campos esperados é RECUSADO', async () => {
    // O que está no Redis foi gravado por uma versão ANTERIOR do código. Um
    // cast cego devolveria um objeto incompleto que só explode lá na tela.
    const cache = new RedisAnalysisCache(
      clienteQueDevolve(JSON.stringify({ url: 'https://x.test', title: 'só isso' })),
    );
    expect(await cache.get(CHAVE)).toBeNull();
  });

  it('análise grande demais NÃO é guardada', async () => {
    // O `Analysis` carrega o texto inteiro do artigo. Acima do teto, o custo
    // de rede da leitura compete com o da análise, e a REST do Upstash tem
    // limite de corpo. Não cachear é sempre melhor que estourar.
    const redis = new FakeRedisClient(relogio());
    const cache = new RedisAnalysisCache(redis);

    const gigante = analise({ title: 'x'.repeat(MAX_CACHED_BYTES + 1) });
    await cache.set(CHAVE, gigante);

    expect(await cache.get(CHAVE)).toBeNull();
  });
});

describe('NoopAnalysisCache', () => {
  it('nunca devolve nada, e gravar não faz nada', async () => {
    const cache = new NoopAnalysisCache();
    await cache.set(CHAVE, analise());
    expect(await cache.get(CHAVE)).toBeNull();
  });
});
