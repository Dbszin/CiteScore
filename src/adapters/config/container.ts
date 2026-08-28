import type { AnalyzeUrlDeps, AnalyzeUrlInput } from '../../core/usecases/analyze-url.js';
import type { Analysis } from '../../core/domain/analysis.js';
import { createAnalyzeUrl } from '../../core/usecases/analyze-url.js';
import { UnlimitedBudgetGuard } from '../budget/unlimited-budget-guard.js';
import {
  ClaudeClassifier,
  createAnthropicClient,
} from '../classify/claude-classifier.js';
import { HybridClassifier } from '../classify/hybrid-classifier.js';
import { SystemClock } from '../clock/system-clock.js';
import { ReadabilityExtractor } from '../extract/readability-extractor.js';
import { HttpContentFetcher } from '../fetch/http-content-fetcher.js';
import { AllowAllRateLimiter } from '../ratelimit/allow-all-rate-limiter.js';
import { IntlSentenceSegmenter } from '../segment/intl-sentence-segmenter.js';
import { NoopSuggestionWriter } from '../suggest/noop-suggestion-writer.js';
import type { ClassifierUsage } from '../../core/ports/claim-classifier.js';
import type { CostRecorder } from '../../core/ports/cost-recorder.js';
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

function buildDeps(): AnalyzeUrlDeps {
  const env = loadEnv();

  const classifier = new HybridClassifier(
    new ClaudeClassifier(createAnthropicClient(env.ANTHROPIC_API_KEY), {
      model: env.ANTHROPIC_MODEL,
      maxSentencesPerCall: env.MAX_SENTENCES_PER_LLM_CALL,
    }),
  );

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
    // TODO(M4/rodada 3): trocar pelos adapters de Upstash Redis. Enquanto
    // forem estes, um deploy em produção falha no primeiro request — de
    // propósito. Teto aprovado: US$ 1/dia.
    rateLimiter: new AllowAllRateLimiter(),
    budgetGuard: new UnlimitedBudgetGuard(),
    costRecorder: new ConsoleCostRecorder(),
    clock: new SystemClock(),
    config: {
      methodologyUrl: env.METHODOLOGY_URL,
      model: env.ANTHROPIC_MODEL,
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
