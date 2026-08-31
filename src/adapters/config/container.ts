import type { AnalyzeUrlDeps, AnalyzeUrlInput } from '../../core/usecases/analyze-url.js';
import type { Analysis } from '../../core/domain/analysis.js';
import { createAnalyzeUrl } from '../../core/usecases/analyze-url.js';
import { UnlimitedBudgetGuard } from '../budget/unlimited-budget-guard.js';
import {
  ClaudeClassifier,
  createAnthropicClient,
} from '../classify/claude-classifier.js';
import { GeminiClassifier } from '../classify/gemini-classifier.js';
import { HybridClassifier } from '../classify/hybrid-classifier.js';
import { SystemClock } from '../clock/system-clock.js';
import { ReadabilityExtractor } from '../extract/readability-extractor.js';
import { HttpContentFetcher } from '../fetch/http-content-fetcher.js';
import { AllowAllRateLimiter } from '../ratelimit/allow-all-rate-limiter.js';
import { IntlSentenceSegmenter } from '../segment/intl-sentence-segmenter.js';
import { NoopSuggestionWriter } from '../suggest/noop-suggestion-writer.js';
import type {
  ClaimClassifier,
  ClassifierUsage,
} from '../../core/ports/claim-classifier.js';
import type { CostRecorder } from '../../core/ports/cost-recorder.js';
import type { BudgetGuard } from '../../core/ports/budget-guard.js';
import type { RateLimiter } from '../../core/ports/rate-limiter.js';
import type { Clock } from '../../core/ports/clock.js';
import { RedisRateLimiter } from '../ratelimit/redis-rate-limiter.js';
import { RedisBudgetGuard } from '../budget/redis-budget-guard.js';
import { RedisCostRecorder } from '../redis/redis-cost-recorder.js';
import { UpstashRedisClient } from '../redis/upstash-client.js';
import { dolaresParaMicros } from '../redis/pricing.js';
import type { Env } from './env.js';
import { loadEnv } from './env.js';

/**
 * Composição das dependências reais. Único lugar do projeto que conhece
 * adapters concretos.
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │ NADA É INSTANCIADO EM TEMPO DE MÓDULO — E ISSO NÃO É ESTILO.        │
 * │                                                                     │
 * │ `AllowAllRateLimiter` e `UnlimitedBudgetGuard` lançam quando        │
 * │ `NODE_ENV === 'production'` (`assertNotProduction`). E `next build` │
 * │ roda com `NODE_ENV=production`. Um `new` no topo deste arquivo      │
 * │ quebraria o build só por alguém ter importado o módulo.             │
 * │                                                                     │
 * │ `loadEnv()` tem o mesmo problema por outro motivo: exige            │
 * │ `ANTHROPIC_API_KEY`, que não existe no ambiente de build.           │
 * │                                                                     │
 * │ A guarda continua valendo onde importa: no primeiro request real em │
 * │ produção sem os adapters de Redis, a construção falha alto. Que é   │
 * │ exatamente o comportamento desejado.                                │
 * └─────────────────────────────────────────────────────────────────────┘
 */

/** Registra custo no log do servidor. Sem banco, por decisão de produto. */
class ConsoleCostRecorder implements CostRecorder {
  async record(usage: ClassifierUsage, model: string): Promise<void> {
    console.info('[citescore] custo', {
      model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheReadInputTokens: usage.cacheReadInputTokens,
    });
  }
}

export interface Guardas {
  readonly rateLimiter: RateLimiter;
  readonly budgetGuard: BudgetGuard;
  readonly costRecorder: CostRecorder;
}

/**
 * Escolhe as guardas pela PRESENÇA DE CREDENCIAIS, não por `NODE_ENV`.
 *
 * Duas propriedades que a escolha por ambiente não daria: dá para exercitar
 * os adapters reais localmente, e um deploy mal configurado continua falhando
 * alto — sem as credenciais, os adapters de desenvolvimento entram e
 * `assertNotProduction` derruba o primeiro request, em vez de a aplicação
 * rodar sem defesa em silêncio.
 */
export function escolherGuardas(env: Env, clock: Clock): Guardas {
  const url = env.REDIS_URL ?? '';
  const token = env.REDIS_TOKEN ?? '';

  if (url.length === 0 || token.length === 0) {
    return {
      rateLimiter: new AllowAllRateLimiter(),
      budgetGuard: new UnlimitedBudgetGuard(),
      costRecorder: new ConsoleCostRecorder(),
    };
  }

  const client = new UpstashRedisClient(url, token);
  const pricing = {
    inputUsdPerMTok: env.MODEL_INPUT_USD_PER_MTOK,
    outputUsdPerMTok: env.MODEL_OUTPUT_USD_PER_MTOK,
  };
  const keyPrefix = 'citescore';

  return {
    rateLimiter: new RedisRateLimiter(client, clock, {
      requestsPerHour: env.RATE_LIMIT_PER_HOUR,
      keyPrefix,
    }),
    budgetGuard: new RedisBudgetGuard(client, clock, {
      dailyBudgetMicros: dolaresParaMicros(env.DAILY_BUDGET_USD),
      maxRequestMicros: dolaresParaMicros(env.MAX_REQUEST_BUDGET_USD),
      pricing,
      outputRatio: env.BUDGET_OUTPUT_RATIO,
      keyPrefix,
    }),
    costRecorder: new RedisCostRecorder({ pricing }),
  };
}

/**
 * Qual provedor classifica.
 *
 * As chaves ja' foram validadas por `loadEnv`, que exige a do provedor
 * escolhido — mas o TypeScript nao sabe disso, e as checagens abaixo existem
 * para nao esconder um `undefined` atras de asercao. Se alguma disparar, e'
 * bug do schema, nao entrada do usuario.
 */
function escolherMotor(env: Env): {
  readonly classifier: ClaimClassifier;
  readonly model: string;
} {
  if (env.LLM_PROVIDER === 'gemini') {
    const apiKey = env.GEMINI_API_KEY;
    if (apiKey === undefined) {
      throw new Error('GEMINI_API_KEY ausente apos a validacao de ambiente');
    }
    return {
      classifier: new GeminiClassifier({
        apiKey,
        model: env.GEMINI_MODEL,
        maxSentencesPerCall: env.MAX_SENTENCES_PER_LLM_CALL,
      }),
      model: env.GEMINI_MODEL,
    };
  }

  const apiKey = env.ANTHROPIC_API_KEY;
  if (apiKey === undefined) {
    throw new Error('ANTHROPIC_API_KEY ausente apos a validacao de ambiente');
  }
  return {
    classifier: new ClaudeClassifier(createAnthropicClient(apiKey), {
      model: env.ANTHROPIC_MODEL,
      maxSentencesPerCall: env.MAX_SENTENCES_PER_LLM_CALL,
    }),
    model: env.ANTHROPIC_MODEL,
  };
}

function buildDeps(): AnalyzeUrlDeps {
  const env = loadEnv();
  const clock = new SystemClock();
  const guardas = escolherGuardas(env, clock);

  const motor = escolherMotor(env);
  const classifier = new HybridClassifier(motor.classifier);

  return {
    fetcher: new HttpContentFetcher({
      maxBytes: env.MAX_CONTENT_BYTES,
      timeoutMs: env.FETCH_TIMEOUT_MS,
      maxRedirects: env.MAX_REDIRECTS,
    }),
    extractor: new ReadabilityExtractor(),
    segmenter: new IntlSentenceSegmenter(),
    classifier,
    suggestionWriter: new NoopSuggestionWriter(),
    rateLimiter: guardas.rateLimiter,
    budgetGuard: guardas.budgetGuard,
    costRecorder: guardas.costRecorder,
    clock,
    config: {
      methodologyUrl: env.METHODOLOGY_URL,
      // O modelo REALMENTE usado, nao o da Anthropic por default: ele viaja
      // ate' a ficha tecnica da tela e ate' o registro de custo. Fixar um
      // nome que nao classificou nada seria relatar execucao que nao houve.
      model: motor.model,
      maxAnalyzableSentences: env.MAX_ANALYZABLE_SENTENCES,
    },
  };
}

let cached: ((input: AnalyzeUrlInput) => Promise<Analysis>) | null = null;

/**
 * Constrói na primeira chamada e reaproveita depois. A construção acontece
 * dentro do handler, nunca no import.
 */
export function getAnalyzeUrl(): (input: AnalyzeUrlInput) => Promise<Analysis> {
  cached ??= createAnalyzeUrl(buildDeps());
  return cached;
}
