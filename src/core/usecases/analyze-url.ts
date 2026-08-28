import type { Analysis } from '../domain/analysis.js';
import type { Suggestion } from '../domain/classification.js';
import { analysisError } from '../domain/errors.js';
import type { ExtractedContent } from '../domain/extracted-content.js';
import { assessIndexPage } from '../domain/index-page-guard.js';
import { buildMethodology } from '../domain/methodology.js';
import type { Sentence } from '../domain/sentence.js';
import type { BudgetGuard } from '../ports/budget-guard.js';
import type {
  ClaimClassifier,
  ClassifierUsage,
} from '../ports/claim-classifier.js';
import type { Clock } from '../ports/clock.js';
import type { ContentExtractor } from '../ports/content-extractor.js';
import type { ContentFetcher } from '../ports/content-fetcher.js';
import type { CostRecorder } from '../ports/cost-recorder.js';
import type { RateLimiter } from '../ports/rate-limiter.js';
import type { SentenceSegmenter } from '../ports/sentence-segmenter.js';
import type { SuggestionWriter } from '../ports/suggestion-writer.js';
import { computeScore } from '../scoring/compute-score.js';
import { SCORE_VERSION } from '../scoring/weights.js';

/**
 * Orquestrador do pipeline (design.md § Flow Diagrams).
 *
 * Recebe todas as portas por injeção e não conhece nenhuma implementação —
 * é o que permite testá-lo inteiro sem rede e sem gastar (ADR-001).
 */

/**
 * Configuração que o caso de uso precisa e que nenhuma porta carrega.
 *
 * DÉBITO DE SPEC: `AnalyzeUrlDeps` em `design.md` § API Contracts não tem
 * este campo, mas os três valores são inevitáveis — `methodologyUrl` é
 * exigido pela ADR-004, `model` é argumento de `CostRecorder.record`, e o cap
 * de sentenças é defesa 2 de `protecao-custo/spec.md`. Ler `env` aqui dentro
 * violaria a pureza do core; então entram por injeção como o resto.
 */
export interface AnalyzeUrlConfig {
  readonly methodologyUrl: string;
  readonly model: string;
  readonly maxAnalyzableSentences: number;
}

export interface AnalyzeUrlDeps {
  readonly fetcher: ContentFetcher;
  readonly extractor: ContentExtractor;
  readonly segmenter: SentenceSegmenter;
  readonly classifier: ClaimClassifier;
  readonly suggestionWriter: SuggestionWriter;
  readonly rateLimiter: RateLimiter;
  readonly budgetGuard: BudgetGuard;
  readonly costRecorder: CostRecorder;
  readonly clock: Clock;
  readonly config: AnalyzeUrlConfig;
}

export interface AnalyzeUrlInput {
  readonly url: string;
  /** IP ou chave derivada, para rate limit. */
  readonly clientKey: string;
  readonly includeSuggestions: boolean;
}

/** @throws AnalysisError */
export function createAnalyzeUrl(
  deps: AnalyzeUrlDeps,
): (input: AnalyzeUrlInput) => Promise<Analysis> {
  return async function analyzeUrl(input: AnalyzeUrlInput): Promise<Analysis> {
    const started = deps.clock.now();

    // ─── 1. Rate limit ────────────────────────────────────────────────
    // Antes do fetch: requisição bloqueada não gasta nem banda.
    const rate = await deps.rateLimiter.check(input.clientKey);
    if (!rate.allowed) {
      throw analysisError('RATE_LIMITED', undefined, rate.retryAfterSeconds);
    }

    // ─── 2. Fetch e extração ──────────────────────────────────────────
    const page = await deps.fetcher.fetch(input.url);
    const content = await deps.extractor.extract(page);

    // ─── 3. Segmentação (local, determinística, grátis) ───────────────
    const allSentences = deps.segmenter.segment(content);

    // ─── 4. Guarda de página-índice ───────────────────────────────────
    // A home de um portal passa pela extração com centenas de "palavras" de
    // manchete solta. Produzir score ali seria falha silenciosa — pior que
    // erro, porque parece resultado.
    if (assessIndexPage(allSentences).isIndexPage) {
      throw analysisError('INDEX_PAGE');
    }

    // ─── 5. Cap de sentenças ──────────────────────────────────────────
    // Truncar em silêncio seria analisar um subconjunto e apresentá-lo como
    // o todo. O relatório sinaliza em `truncated`.
    const analyzable = allSentences.filter((sentence) => sentence.analyzable);
    const truncated = analyzable.length > deps.config.maxAnalyzableSentences;
    const kept = truncated
      ? analyzable.slice(0, deps.config.maxAnalyzableSentences)
      : analyzable;

    // ─── 6. Pré-flight de custo ───────────────────────────────────────
    // ESTA É A FRONTEIRA DO GASTO. Tudo acima é grátis; tudo abaixo custa.
    // Inverter 6 e 7 anula a proteção sem produzir nenhum erro visível —
    // por isso existe teste de ordem (api/spec.md § Acceptance Criteria).
    const estimatedTokens = await estimateInputTokens(
      deps.classifier,
      kept,
      content,
    );
    const budget = await deps.budgetGuard.authorize(estimatedTokens);
    if (!budget.allowed) {
      throw analysisError('BUDGET_EXCEEDED', undefined, budget.retryAfterSeconds);
    }

    // ─── 7. Classificação (paga) ──────────────────────────────────────
    const classification = await deps.classifier.classify(kept, content);

    // ─── 8. Score ─────────────────────────────────────────────────────
    const { outcome, breakdown } = computeScore(
      classification.classifications,
      kept.length,
    );

    // ─── 9. Sugestões — degradam, não derrubam ────────────────────────
    let suggestions: readonly Suggestion[] = [];
    let suggestionsDegraded = false;
    let suggestionUsage: ClassifierUsage | null = null;

    if (input.includeSuggestions) {
      const unsourcedIds = new Set(
        classification.classifications
          .filter((item) => item.category === 'UNSOURCED')
          .map((item) => item.sentenceId),
      );
      const unsourced = kept.filter((sentence) => unsourcedIds.has(sentence.id));

      if (unsourced.length > 0) {
        try {
          const written = await deps.suggestionWriter.write(unsourced, content);
          suggestions = written.suggestions;
          suggestionUsage = written.usage;
        } catch {
          // O relatório ainda entrega score, breakdown e highlight, que são a
          // maior parte do valor. Perder as sugestões não justifica perder
          // tudo — degradação graciosa é contrato da porta.
          suggestionsDegraded = true;
        }
      }
    }

    // ─── 10. Registro de custo ────────────────────────────────────────
    const totalUsage = mergeUsage(classification.usage, suggestionUsage);
    if (totalUsage !== null) {
      await deps.costRecorder.record(totalUsage, deps.config.model);
    }

    return {
      url: content.url,
      title: content.title,
      language: content.language,
      scoreVersion: SCORE_VERSION,
      outcome,
      breakdown,
      sentences: allSentences,
      classifications: classification.classifications,
      suggestions,
      suggestionsDegraded,
      truncated,
      methodology: buildMethodology(deps.config.methodologyUrl),
      durationMs: deps.clock.now() - started,
    };
  };
}

/**
 * Usa a contagem do próprio classificador quando ele oferece uma — a
 * implementação real chama `countTokens` da API, nunca `tiktoken`, que é de
 * outro provedor e mede outra coisa.
 *
 * Cai na aproximação por caracteres em dois casos: quando o classificador não
 * sabe contar (stub de teste, adapter local que não gasta token) e quando a
 * contagem FALHA.
 *
 * A degradação é deliberada, e a razão importa. Falhar fechado seria certo se
 * a alternativa fosse autorizar sem estimativa — mas a alternativa aqui é uma
 * estimativa conservadora e não-nula, então o `BudgetGuard` continua
 * decidindo sobre um número da ordem de grandeza certa. O teto segue valendo.
 *
 * E não esconde falha: se `countTokens` caiu porque o provedor está fora, a
 * classificação logo abaixo cai também, e o erro passa a vir da operação que
 * de fato importa em vez de uma chamada gratuita e auxiliar. Antes, uma
 * indisponibilidade momentânea nessa chamada derrubava a análise inteira.
 *
 * O que NÃO é aceitável é degradar para zero: isso autorizaria qualquer
 * gasto. Com sentenças presentes, a aproximação é sempre ≥ 1.
 */
async function estimateInputTokens(
  classifier: ClaimClassifier,
  sentences: readonly Sentence[],
  content: ExtractedContent,
): Promise<number> {
  if (typeof classifier.estimateInputTokens === 'function') {
    try {
      return await classifier.estimateInputTokens(sentences, content);
    } catch {
      // Cai na aproximação abaixo.
    }
  }
  return approximateTokens(sentences);
}

function approximateTokens(sentences: readonly Sentence[]): number {
  const chars = sentences.reduce((sum, s) => sum + s.text.length, 0);
  return Math.ceil(chars / 3.5);
}

function mergeUsage(
  a: ClassifierUsage | null,
  b: ClassifierUsage | null,
): ClassifierUsage | null {
  if (a === null) return b;
  if (b === null) return a;
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheCreationInputTokens:
      a.cacheCreationInputTokens + b.cacheCreationInputTokens,
    cacheReadInputTokens: a.cacheReadInputTokens + b.cacheReadInputTokens,
  };
}
