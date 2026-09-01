import type { Analysis } from '../domain/analysis.js';
import type { Suggestion } from '../domain/classification.js';
import { analysisError, isAnalysisError } from '../domain/errors.js';
import type { ExtractedContent } from '../domain/extracted-content.js';
import { assessIndexPage } from '../domain/index-page-guard.js';
import { buildMethodology } from '../domain/methodology.js';
import { buildAnalysisCacheKey } from '../domain/cache-key.js';
import type { AnalysisCache } from '../ports/analysis-cache.js';
import type { Sentence } from '../domain/sentence.js';
import type { BudgetGuard } from '../ports/budget-guard.js';
import type {
  ClaimClassifier,
  ClassificationResult,
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
  /**
   * OPCIONAL de propósito. Cache é conveniência, e um contrato que o exige
   * transformaria conveniência em ponto de falha — além de obrigar todo teste
   * do pipeline a montar um cache que ele não usa.
   */
  readonly analysisCache?: AnalysisCache;
}

export interface AnalyzeUrlInput {
  readonly url: string;
  /** IP ou chave derivada, para rate limit. */
  readonly clientKey: string;
  readonly includeSuggestions: boolean;
  /**
   * Ignora o que estiver guardado e analisa de novo.
   *
   * É o que impede o cache de quebrar o caso de uso principal: quem editou o
   * próprio artigo e voltou para conferir PRECISA de medição nova, e receber
   * o resultado de antes faria a reescrita dele parecer inútil.
   *
   * Não é porta dos fundos para gasto: `refresh` acontece DEPOIS do rate
   * limit, então continua limitado a 10 por hora como qualquer análise.
   */
  readonly refresh?: boolean;
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

    // ─── 2. Cache ─────────────────────────────────────────────────────
    // DEPOIS do rate limit: acerto de cache não pode virar burla de limite.
    // ANTES do fetch: o acerto pula busca, extração, segmentação e
    // classificação de uma vez — economiza o gasto E os ~10 segundos.
    const cacheKey = buildAnalysisCacheKey({
      url: input.url,
      scoreVersion: SCORE_VERSION,
      model: deps.config.model,
    });

    if (deps.analysisCache !== undefined && input.refresh !== true) {
      const guardada = await deps.analysisCache.get(cacheKey);
      if (guardada !== null) {
        /*
         * A METODOLOGIA E' REDECLARADA, NUNCA SERVIDA DO CACHE.
         *
         * A ADR-004 faz da ressalva um campo obrigatório do contrato para que
         * ela não dependa de ninguém lembrar de exibi-la. O cache abre um
         * caminho por onde ela envelhece mesmo assim: a análise inteira é
         * guardada, bloco de metodologia junto, e uma correção no código não
         * alcança quem recebe resposta guardada.
         *
         * Encontrado rodando em modo produção: as três entradas da vitrine
         * serviam `methodologyUrl: '/#metodo'` — uma seção que cobre um dos
         * três itens que a ADR-004 exige — enquanto o código já apontava para
         * a página `/metodologia`, que cobre os três. Prazo de trinta dias.
         *
         * A separação que resolve: o cache existe para não REMEDIR. A
         * metodologia não é medição — é o que este build afirma sobre o que
         * mediu e o que não mediu. Guarda-se o número; declara-se o contrato.
         *
         * Vale para `DISCLAIMER_PT_BR` na mesma medida: emendar o texto passa
         * a alcançar todo mundo na resposta seguinte, e não conforme as
         * entradas expiram.
         */
        return {
          ...guardada,
          methodology: buildMethodology(deps.config.methodologyUrl),
        };
      }
    }

    // ─── 3. Fetch e extração ──────────────────────────────────────────
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
      // As duas recusas são opostas do ponto de vista de quem está na tela:
      // "este artigo é caro demais" tem saída — tentar um menor —, "a cota do
      // dia acabou" não tem. Colapsá-las num código só transformaria um
      // problema resolvível num beco aparente.
      throw analysisError(
        budget.reason === 'request_too_expensive'
          ? 'REQUEST_TOO_EXPENSIVE'
          : 'BUDGET_EXCEEDED',
        undefined,
        budget.retryAfterSeconds,
      );
    }

    // ─── 7. Classificação (paga) ──────────────────────────────────────
    //
    // A partir daqui existe uma RESERVA em aberto, e ela precisa ser fechada
    // em qualquer desfecho (ADR-009). Antes disso não existia liquidação: uma
    // falha do classificador deixava a pré-cobrança presa por 48h, e uma
    // sequência de falhas esgotava o teto sem ter gasto um centavo — a defesa
    // de custo virava negação de serviço.
    let classification: ClassificationResult;
    try {
      classification = await deps.classifier.classify(kept, content);
    } catch (cause) {
      // O classificador sabe quanto já foi pago quando falha no meio dos
      // lotes: devolve-se só o que NÃO foi gasto. Devolver a estimativa
      // inteira zeraria o contador sobre dinheiro real — o furo oposto.
      await deps.budgetGuard.settle(
        estimatedTokens,
        isAnalysisError(cause) ? cause.partialUsage : null,
      );
      // O erro original sobe intacto: um problema de contabilidade não pode
      // mascarar a causa que o usuário e o log precisam ver.
      throw cause;
    }

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

    // ─── 10. Liquidação e registro de custo ───────────────────────────
    // Fecha a reserva com o uso REAL. O guard reproduz o que cobrou a partir
    // do mesmo `estimatedTokens`, então o ajuste é exato.
    const totalUsage = mergeUsage(classification.usage, suggestionUsage);
    await deps.budgetGuard.settle(estimatedTokens, totalUsage);

    if (totalUsage !== null) {
      await deps.costRecorder.record(totalUsage, deps.config.model);
    }

    const analysis: Analysis = {
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

    /*
     * Gravar é a ÚLTIMA coisa, e o `await` é deliberado.
     *
     * Disparar sem esperar devolveria a resposta alguns milissegundos antes e
     * abriria uma corrida: em ambiente serverless a instância pode ser
     * congelada assim que a resposta sai, e a gravação nunca aconteceria — um
     * cache que silenciosamente não guarda nada é pior que não ter cache,
     * porque ninguém percebe.
     *
     * O adapter engole os próprios erros, então isto não pode derrubar uma
     * análise que já foi feita e paga.
     */
    if (deps.analysisCache !== undefined) {
      await deps.analysisCache.set(cacheKey, analysis);
    }

    return analysis;
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
