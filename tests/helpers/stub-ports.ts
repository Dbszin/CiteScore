import type { Classification } from '../../src/core/domain/classification.js';
import type {
  ContentShape,
  ExtractedContent,
} from '../../src/core/domain/extracted-content.js';
import type { Sentence } from '../../src/core/domain/sentence.js';
import type { BudgetGuard, BudgetDecision } from '../../src/core/ports/budget-guard.js';
import type {
  ClaimClassifier,
  ClassificationResult,
  ClassifierUsage,
} from '../../src/core/ports/claim-classifier.js';
import type { Clock } from '../../src/core/ports/clock.js';
import type { ContentExtractor } from '../../src/core/ports/content-extractor.js';
import type {
  ContentFetcher,
  FetchedPage,
} from '../../src/core/ports/content-fetcher.js';
import type { CostRecorder } from '../../src/core/ports/cost-recorder.js';
import type {
  RateLimiter,
  RateLimitDecision,
} from '../../src/core/ports/rate-limiter.js';
import type { SentenceSegmenter } from '../../src/core/ports/sentence-segmenter.js';
import type {
  SuggestionResult,
  SuggestionWriter,
} from '../../src/core/ports/suggestion-writer.js';
import type {
  AnalyzeUrlConfig,
  AnalyzeUrlDeps,
} from '../../src/core/usecases/analyze-url.js';

/**
 * Portas stubadas para exercitar o caso de uso inteiro sem rede e sem gastar.
 *
 * Todos os stubs registram em `calls` — o array compartilhado que torna
 * verificável a ORDEM do pipeline. Sem ele, o teste de que o budget guard
 * roda antes do classificador não passaria de comentário.
 */

export const DEFAULT_SHAPE: ContentShape = {
  readerable: true,
  linkCount: 4,
  headingCount: 2,
  charsPerWord: 5.1,
  linksPerWord: 0.01,
};

export function makeContent(
  overrides: Partial<ExtractedContent> = {},
): ExtractedContent {
  return {
    url: 'https://exemplo.com/artigo',
    title: 'Artigo de teste',
    text: 'Texto extraído.',
    language: 'pt-BR',
    wordCount: 500,
    shape: DEFAULT_SHAPE,
    ...overrides,
  };
}

/** Sentenças analisáveis, com ids 0..n-1 e offsets coerentes. */
export function makeSentences(
  count: number,
  overrides: Partial<Sentence> = {},
): Sentence[] {
  let cursor = 0;
  return Array.from({ length: count }, (_, index) => {
    const text = `Sentença analisável número ${index} com conteúdo suficiente.`;
    const sentence: Sentence = {
      id: index,
      text,
      start: cursor,
      end: cursor + text.length,
      analyzable: true,
      ...overrides,
    };
    cursor += text.length + 1;
    return sentence;
  });
}

export function classifyAll(
  sentences: readonly Sentence[],
  category: Classification['category'] = 'UNSOURCED',
): Classification[] {
  return sentences.map((sentence) => ({
    sentenceId: sentence.id,
    category,
    confidence: 0.8,
    decidedBy: 'llm' as const,
    signals: [],
  }));
}

export class StubFetcher implements ContentFetcher {
  constructor(
    private readonly calls: string[],
    private readonly result: FetchedPage | Error,
  ) {}

  async fetch(): Promise<FetchedPage> {
    this.calls.push('fetch');
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
}

export class StubExtractor implements ContentExtractor {
  constructor(
    private readonly calls: string[],
    private readonly result: ExtractedContent | Error,
  ) {}

  async extract(): Promise<ExtractedContent> {
    this.calls.push('extract');
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
}

export class StubSegmenter implements SentenceSegmenter {
  constructor(
    private readonly calls: string[],
    private readonly sentences: readonly Sentence[],
  ) {}

  segment(): readonly Sentence[] {
    this.calls.push('segment');
    return this.sentences;
  }
}

export class StubClassifier implements ClaimClassifier {
  /** Sentenças que `classify` recebeu, para verificar o cap de truncagem. */
  received: readonly Sentence[] = [];

  constructor(
    private readonly calls: string[],
    private readonly result: ClassificationResult | Error,
    private readonly tokenEstimate: number | null = 1_000,
  ) {}

  async classify(sentences: readonly Sentence[]): Promise<ClassificationResult> {
    this.calls.push('classify');
    this.received = sentences;
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }

  async estimateInputTokens(): Promise<number> {
    this.calls.push('estimateInputTokens');
    return this.tokenEstimate ?? 0;
  }
}

/** Classificador sem `estimateInputTokens`, para o caminho de fallback. */
export class StubClassifierWithoutCount implements ClaimClassifier {
  constructor(
    private readonly calls: string[],
    private readonly result: ClassificationResult,
  ) {}

  async classify(): Promise<ClassificationResult> {
    this.calls.push('classify');
    return this.result;
  }
}

export class StubRateLimiter implements RateLimiter {
  constructor(
    private readonly calls: string[],
    private readonly decision: RateLimitDecision = {
      allowed: true,
      remaining: 9,
      retryAfterSeconds: null,
    },
  ) {}

  async check(): Promise<RateLimitDecision> {
    this.calls.push('rateLimit');
    return this.decision;
  }
}

export class StubBudgetGuard implements BudgetGuard {
  /** Estimativa recebida, para verificar que o pré-flight foi alimentado. */
  authorizedWith: number | null = null;

  /**
   * Liquidações observadas. É o que torna a invariante da ADR-009
   * verificável: autorizou, liquidou. Sem registrar, "sempre liquida" seria
   * intenção, não fato.
   */
  readonly settlements: {
    estimatedInputTokens: number;
    actualUsage: ClassifierUsage | null;
  }[] = [];

  constructor(
    private readonly calls: string[],
    private readonly allowed = true,
    private readonly retryAfterSeconds: number | null = null,
  ) {}

  async authorize(estimatedInputTokens: number): Promise<BudgetDecision> {
    this.calls.push('budget');
    this.authorizedWith = estimatedInputTokens;
    return {
      allowed: this.allowed,
      reason: this.allowed ? 'ok' : 'daily_cap_reached',
      estimatedInputTokens,
      retryAfterSeconds: this.retryAfterSeconds,
    };
  }

  async settle(
    estimatedInputTokens: number,
    actualUsage: ClassifierUsage | null,
  ): Promise<void> {
    this.calls.push('settle');
    this.settlements.push({ estimatedInputTokens, actualUsage });
  }
}

export class StubSuggestionWriter implements SuggestionWriter {
  constructor(
    private readonly calls: string[],
    private readonly result: SuggestionResult | Error = {
      suggestions: [],
      usage: null,
    },
  ) {}

  async write(): Promise<SuggestionResult> {
    this.calls.push('suggest');
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
}

export class RecordingCostRecorder implements CostRecorder {
  readonly entries: { usage: unknown; model: string }[] = [];

  constructor(private readonly calls: string[]) {}

  async record(usage: unknown, model: string): Promise<void> {
    this.calls.push('cost');
    this.entries.push({ usage, model });
  }
}

/** Relógio que avança um passo fixo a cada leitura: `durationMs` fica estável. */
export class SteppingClock implements Clock {
  private current: number;

  constructor(
    start = 1_000,
    private readonly step = 250,
  ) {
    this.current = start;
  }

  now(): number {
    const value = this.current;
    this.current += this.step;
    return value;
  }
}

export const TEST_CONFIG: AnalyzeUrlConfig = {
  methodologyUrl: '/metodologia',
  model: 'claude-haiku-4-5',
  maxAnalyzableSentences: 400,
};

export const FETCHED_PAGE: FetchedPage = {
  finalUrl: 'https://exemplo.com/artigo',
  html: '<html></html>',
  contentType: 'text/html',
  byteLength: 1_234,
};

export interface Harness {
  readonly calls: string[];
  readonly deps: AnalyzeUrlDeps;
  /**
   * As instâncias que `deps` REALMENTE usa.
   *
   * Antes eram as que o harness construía, e `deps` aplicava `...overrides`
   * depois — então um teste que sobrescrevesse uma dessas portas e depois
   * asseverasse sobre a referência devolvida inspecionava um objeto que o
   * pipeline nunca tocou, e passava. Agora saem de `deps`: sobrescrever com
   * outro tipo faz o campo específico do stub vir `undefined` e a asserção
   * falhar alto, em vez de mentir baixo.
   */
  readonly classifier: StubClassifier;
  readonly budgetGuard: StubBudgetGuard;
  readonly costRecorder: RecordingCostRecorder;
}

/**
 * Monta um pipeline inteiro com valores sensatos. Cada teste sobrescreve
 * apenas a porta que lhe interessa, o que mantém visível o que está sendo
 * exercitado.
 */
export function makeHarness(
  overrides: Partial<AnalyzeUrlDeps> = {},
  options: {
    sentences?: readonly Sentence[];
    content?: ExtractedContent;
    classifications?: readonly Classification[];
  } = {},
): Harness {
  const calls: string[] = [];
  const sentences = options.sentences ?? makeSentences(20);
  const content = options.content ?? makeContent();
  const classifications =
    options.classifications ??
    classifyAll(sentences.filter((sentence) => sentence.analyzable));

  const deps: AnalyzeUrlDeps = {
    fetcher: new StubFetcher(calls, FETCHED_PAGE),
    extractor: new StubExtractor(calls, content),
    segmenter: new StubSegmenter(calls, sentences),
    classifier: new StubClassifier(calls, {
      classifications,
      usage: {
        inputTokens: 900,
        outputTokens: 300,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
      },
    }),
    suggestionWriter: new StubSuggestionWriter(calls),
    rateLimiter: new StubRateLimiter(calls),
    budgetGuard: new StubBudgetGuard(calls),
    costRecorder: new RecordingCostRecorder(calls),
    clock: new SteppingClock(),
    config: TEST_CONFIG,
    ...overrides,
  };

  // Derivadas de `deps`, depois do spread: são sempre as que o pipeline usa.
  return {
    calls,
    deps,
    classifier: deps.classifier as StubClassifier,
    budgetGuard: deps.budgetGuard as StubBudgetGuard,
    costRecorder: deps.costRecorder as RecordingCostRecorder,
  };
}
