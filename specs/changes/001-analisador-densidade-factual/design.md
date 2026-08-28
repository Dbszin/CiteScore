# Design: Analisador de Densidade Factual (v1)

## Overview

Pipeline de cinco estágios atrás de um único caso de uso, com domínio isolado por portas.

```
URL → fetch → extração → segmentação → classificação híbrida → scoring → relatório
```

O caso de uso `analyzeUrl` orquestra os estágios. Nenhum estágio conhece o próximo: cada um recebe e devolve tipos de domínio. As dependências externas (rede, HTML, Claude API, contadores) entram por porta, conforme [ADR-001](../../decisions/001-arquitetura-hexagonal.md).

Guardas de custo não são um estágio do pipeline — são um **portão antes dele**. Nenhum token é gasto antes de rate limit, cap de conteúdo e budget guard passarem.

---

## Proposed Directory & File Structure

```
citescore/
├── docs/                                       (existente, do Long-Term Manager)
├── specs/                                      (existente, este change)
│
├── src/
│   ├── app/
│   │   ├── layout.tsx                          (New) M3
│   │   ├── page.tsx                            (New) M3 — entrada de URL + resultado
│   │   ├── globals.css                         (New) M3
│   │   ├── metodologia/
│   │   │   └── page.tsx                        (New) M3 — exigência de ADR-004
│   │   └── api/
│   │       └── analyze/
│   │           └── route.ts                    (New) M2 — adapter de entrada HTTP
│   │
│   ├── core/                                   ← domínio puro; não importa infraestrutura
│   │   ├── domain/
│   │   │   ├── sentence.ts                     (New) M1
│   │   │   ├── classification.ts               (New) M1
│   │   │   ├── extracted-content.ts            (New) M1
│   │   │   ├── analysis.ts                     (New) M1
│   │   │   ├── methodology.ts                  (New) M1 — ADR-004
│   │   │   └── errors.ts                       (New) M1
│   │   ├── ports/
│   │   │   ├── content-fetcher.ts              (New) M1
│   │   │   ├── content-extractor.ts            (New) M1
│   │   │   ├── sentence-segmenter.ts           (New) M1
│   │   │   ├── claim-classifier.ts             (New) M1
│   │   │   ├── suggestion-writer.ts            (New) M1
│   │   │   ├── rate-limiter.ts                 (New) M1
│   │   │   ├── budget-guard.ts                 (New) M1
│   │   │   ├── cost-recorder.ts                (New) M1
│   │   │   └── clock.ts                        (New) M1
│   │   ├── scoring/
│   │   │   ├── weights.ts                      (New) M2 — ADR-003, ponto único
│   │   │   └── compute-score.ts                (New) M2 — função pura
│   │   └── usecases/
│   │       └── analyze-url.ts                  (New) M2 — orquestrador
│   │
│   ├── adapters/
│   │   ├── fetch/
│   │   │   └── http-content-fetcher.ts         (New) M2
│   │   ├── extract/
│   │   │   └── readability-extractor.ts        (New) M2
│   │   ├── segment/
│   │   │   └── intl-sentence-segmenter.ts      (New) M2
│   │   ├── classify/
│   │   │   ├── rule-prefilter.ts               (New) M2
│   │   │   ├── claude-classifier.ts            (New) M2
│   │   │   ├── claude-suggestion-writer.ts     (New) M3
│   │   │   ├── hybrid-classifier.ts            (New) M2
│   │   │   ├── schemas.ts                      (New) M2 — Zod p/ structured output
│   │   │   ├── prompts/
│   │   │   │   ├── classify-system.ts          (New) M2 — prefixo cacheável
│   │   │   │   └── suggest-system.ts           (New) M3
│   │   │   └── signals/
│   │   │       ├── types.ts                    (New) M2
│   │   │       ├── pt-br.ts                    (New) M2 — ADR-002
│   │   │       └── en.ts                       (New) M2
│   │   ├── ratelimit/
│   │   │   ├── redis-rate-limiter.ts           (New) M4
│   │   │   └── allow-all-rate-limiter.ts       (New) M2 — dev/teste
│   │   ├── budget/
│   │   │   ├── redis-budget-guard.ts           (New) M4
│   │   │   ├── redis-cost-recorder.ts          (New) M4
│   │   │   └── unlimited-budget-guard.ts       (New) M2 — dev/teste
│   │   ├── clock/
│   │   │   └── system-clock.ts                 (New) M1
│   │   └── config/
│   │       ├── env.ts                          (New) M1 — validação de env com Zod
│   │       └── container.ts                    (New) M2 — composição das portas
│   │
│   ├── components/                             ← M3, definido pelo Designer
│   │   ├── url-form.tsx                        (New) M3
│   │   ├── score-panel.tsx                     (New) M3
│   │   ├── breakdown-chart.tsx                 (New) M3
│   │   ├── inline-highlight.tsx                (New) M3
│   │   ├── suggestion-list.tsx                 (New) M3
│   │   └── methodology-notice.tsx              (New) M3 — ADR-004
│   │
│   └── lib/
│       └── api-client.ts                       (New) M3 — cliente tipado da rota
│
├── tests/
│   ├── core/
│   │   ├── scoring/compute-score.test.ts       (New) M2 — tabela de casos
│   │   └── usecases/analyze-url.test.ts        (New) M2 — portas stubadas
│   ├── adapters/
│   │   ├── extract/readability-extractor.test.ts   (New) M2
│   │   ├── segment/intl-sentence-segmenter.test.ts (New) M2
│   │   ├── classify/rule-prefilter.test.ts     (New) M2
│   │   └── budget/redis-budget-guard.test.ts   (New) M4
│   ├── contract/
│   │   └── analyze-response.test.ts            (New) M2 — ADR-004, falha se faltar campo
│   ├── fixtures/
│   │   ├── html/                               (New) M2 — páginas salvas
│   │   └── corpus/                             (New) M2 — URLs de calibração
│   └── helpers/
│       └── stub-ports.ts                       (New) M2
│
├── scripts/
│   └── calibrate.ts                            (New) M2 — acceptance criteria de M2
│
├── .env.example                                (New) M1
├── .eslintrc.json                              (New) M1 — no-restricted-imports em core
├── next.config.ts                              (New) M1
├── tsconfig.json                               (New) M1
├── package.json                                (New) M1
└── vitest.config.ts                            (New) M1
```

Nenhum arquivo é `(Modified)` ou `(Removed)`: o repositório está vazio.

---

## Code Architecture & Design Patterns

### [Padrões Aplicados]

| Pilar / Padrão | Onde | Justificativa |
|---|---|---|
| **Hexagonal (Ports & Adapters)** | `src/core/ports/` vs `src/adapters/` | O marco de maior risco (M2) exige centenas de execuções sobre corpus. Sem portas, cada execução custa rede e dinheiro. A arquitetura existe para viabilizar a calibração — [ADR-001](../../decisions/001-arquitetura-hexagonal.md) |
| **Strategy** | `RulePrefilter` e `ClaudeClassifier` sob a mesma porta `ClaimClassifier` | Duas estratégias de classificação intercambiáveis. Permite rodar a calibração em modo só-regras (grátis) para isolar erros do pré-filtro dos erros do modelo |
| **Composite** | `HybridClassifier` | É um `ClaimClassifier` que compõe dois `ClaimClassifier`. O caso de uso não sabe que a classificação é híbrida — trocar por LLM puro ou regras puras não muda uma linha do domínio |
| **Adapter / ACL** | `ReadabilityExtractor`, `ClaudeClassifier` | Traduzem modelos externos (DOM do Readability, blocos de conteúdo da Messages API) para tipos de domínio. Nenhum tipo do SDK Anthropic atravessa a fronteira de `src/core/` |
| **Pure Function Core** | `computeScore` em `src/core/scoring/` | A fórmula do score é determinística e sem efeito colateral: testável por tabela, sem mock. É a peça que precisa ser auditável — [ADR-003](../../decisions/003-formula-do-score.md) |
| **Value Object** | `Sentence`, `Classification`, `ScoreBreakdown` | Imutáveis, com igualdade por valor, sem identidade. Não há entidade persistida no v1 — não há banco |
| **Guard Clause / Gatekeeper** | `RateLimiter` + `BudgetGuard` antes do pipeline | Falha rápido antes de gastar. Colocar a proteção dentro do pipeline permitiria gasto parcial antes da recusa |
| **Rate Limiting & Throttling** | `RedisRateLimiter` | Proteção de recurso contra abuso. Bloqueador de deploy público — [protecao-custo](specs/protecao-custo/spec.md) |
| **Retry com backoff** | `maxRetries` do SDK Anthropic; retry explícito no fetch | Falha transitória de rede não deve derrubar a análise. O SDK já traz 2 retentativas por padrão para 408/409/429/5xx |
| **Graceful Degradation** | Sugestões separadas da classificação | Se a chamada de sugestões falhar, o relatório ainda entrega score, breakdown e highlight. O produto degrada em vez de cair |
| **Contract Testing** | `tests/contract/analyze-response.test.ts` | Torna a honestidade do score verificável pela máquina em vez de dependente de revisão humana — [ADR-004](../../decisions/004-honestidade-como-contrato.md) |
| **Idempotência** | `GET`-like semântica no `POST /api/analyze` | A análise não tem efeito colateral persistido: mesma URL, mesmo resultado (a menos da não-determinação do LLM). Reprocessar é seguro |

### Padrões deliberadamente **não** aplicados

Registrado para que a ausência seja lida como decisão, não como esquecimento:

- **Repository / Unit of Work** — não há persistência no v1.
- **CQRS, Event Sourcing, Saga, Outbox** — não há escrita, não há evento, não há transação distribuída. Aplicá-los aqui seria cerimônia sem contrapartida.
- **Circuit Breaker** — considerado para a Claude API. Deixado fora do v1 porque o budget guard já corta o consumo pelo lado do custo, e sem tráfego real não há base para calibrar o limiar de abertura. Reavaliar quando houver volume.
- **Aggregate Root / DDD tático completo** — o domínio tem uma única raiz de consistência (a análise) e ela é efêmera.

### [Estratégia de Implementação]

**Ordem, e por que ela é essa:**

1. **M1 — Congelar portas e tipos de domínio primeiro.** Nada de adapter antes disso. É o que permite paralelizar os quatro adapters depois, e é o que impede retrabalho em cascata quando um tipo muda.
2. **M2 — Pipeline de baixo para cima, terminando no orquestrador.** Cada adapter tem teste próprio contra fixture antes de ser plugado. `computeScore` é escrito por tabela de casos, incluindo os quatro casos de borda de [ADR-003](../../decisions/003-formula-do-score.md).
3. **M2 — `scripts/calibrate.ts` é entregável, não ferramenta descartável.** É o instrumento que responde à única pergunta que decide o produto: a classificação é boa? Roda sobre corpus versionado, emite taxa de escalonamento, distribuição por `decidedBy` e custo real por `usage`.
4. **M3 — UI depois de o motor estar validado.** Construir tela sobre classificador não calibrado é construir sobre areia.
5. **M4 — Guardas antes do deploy, nunca depois.** Deploy público sem os três P0 de proteção é o risco mais caro do projeto.

**Relação entre componentes:**

A rota HTTP monta o container, chama `analyzeUrl` e traduz erro de domínio em status. `analyzeUrl` chama as portas em sequência e não conhece nenhuma implementação. `HybridClassifier` é o único ponto que sabe que existe pré-filtro e LLM. `computeScore` recebe apenas a lista de classificações e devolve o score — não sabe de onde as classificações vieram.

**Fluxo de dados:** unidirecional, sem estado compartilhado. Cada estágio recebe o produto do anterior e devolve um valor novo. Nada é mutado no lugar.

**Tratamento de erro:** todo erro esperado é um tipo de domínio (`AnalysisError` com `code` fechado), não uma exceção genérica. A rota mapeia `code` para status HTTP em um único ponto. Erro inesperado retorna 500 sem vazar detalhe interno.

**Resiliência:** falha da chamada de sugestões degrada em vez de derrubar. Falha da classificação é fatal — sem classificação não há produto a entregar. Recusa do modelo (`stop_reason === "refusal"`) é tratada como erro de domínio com o fallback server-side já habilitado.

---

## Data Model

```typescript
// ─── src/core/domain/sentence.ts ───────────────────────────────────────────

/** Índice de uma sentença no texto extraído, base 0. */
export type SentenceId = number;

/**
 * Uma sentença do conteúdo extraído.
 * `analyzable === false` para heading, item de lista curto, legenda e
 * fragmento sem verbo — não entram em N nem recebem classificação.
 */
export interface Sentence {
  readonly id: SentenceId;
  readonly text: string;
  /** Offsets no texto extraído, para o highlight inline reconstruir a posição. */
  readonly start: number;
  readonly end: number;
  readonly analyzable: boolean;
  /** Motivo da exclusão quando `analyzable === false`. */
  readonly excludedReason?: 'heading' | 'short' | 'no_verb' | 'list_item' | 'caption';
}

// ─── src/core/domain/classification.ts ─────────────────────────────────────

export type ClaimCategory =
  /** Afirmação sustentada por dado, número, data ou fonte atribuída. */
  | 'SOURCED'
  /** Afirmação factual sem fonte. A categoria acionável do produto. */
  | 'UNSOURCED'
  /** Juízo de valor, recomendação ou preferência. Não é defeito. */
  | 'OPINION';

export type DecidedBy = 'rules' | 'llm';

/** Sinal detectado pelo pré-filtro. Nomes vêm das tabelas em signals/. */
export type SignalName = string;

export interface Classification {
  readonly sentenceId: SentenceId;
  readonly category: ClaimCategory;
  /** 0..1. Regra de alta confiança emite >= 0.9; LLM reporta a própria. */
  readonly confidence: number;
  readonly decidedBy: DecidedBy;
  /** Sinais que o pré-filtro encontrou. Alimenta a explicação na UI. */
  readonly signals: readonly SignalName[];
}

/** Veredito parcial do pré-filtro: pode não decidir. */
export type PrefilterVerdict =
  | { readonly kind: 'decided'; readonly classification: Classification }
  | { readonly kind: 'escalate'; readonly sentenceId: SentenceId; readonly signals: readonly SignalName[] };

export interface Suggestion {
  readonly sentenceId: SentenceId;
  /** O que está faltando, em linguagem de quem escreve. */
  readonly issue: string;
  /** Ação concreta de reescrita. */
  readonly action: string;
}

// ─── src/core/domain/extracted-content.ts ──────────────────────────────────

export type SupportedLanguage = 'pt-BR' | 'en';

export interface ExtractedContent {
  readonly url: string;
  readonly title: string | null;
  /** Texto principal, boilerplate removido. */
  readonly text: string;
  readonly language: SupportedLanguage;
  readonly wordCount: number;
  /** Domínios externos linkados no conteúdo — sinal pró-fonte do pré-filtro. */
  readonly externalDomains: readonly string[];
}

// ─── src/core/domain/methodology.ts ────────────────────────────────────────

/**
 * Exigência de ADR-004: a natureza estimada do score é campo obrigatório
 * do contrato, não texto de UI. `kind` é literal fechado de propósito —
 * publicar uma resposta que se apresente como medição exige mudar o tipo.
 */
export interface Methodology {
  readonly kind: 'heuristic_proxy';
  readonly measuredCitations: false;
  readonly disclaimer: string;
  readonly methodologyUrl: string;
}

// ─── src/core/domain/analysis.ts ───────────────────────────────────────────

export interface ScoreBreakdown {
  /** N — sentenças analisáveis. */
  readonly analyzableSentences: number;
  readonly sourced: number;
  readonly unsourced: number;
  readonly opinion: number;
  /** FD = sourced / N, arredondado a 4 casas. */
  readonly factualDensity: number;
  /** GAP = unsourced / (sourced + unsourced). `null` quando não há afirmação. */
  readonly gapRate: number | null;
  /** Fração escalada ao LLM. Observabilidade da meta de ADR-002. */
  readonly llmEscalationRate: number;
}

/** Score é opcional por desenho: ADR-003 exige distinguir zero de ausência. */
export type ScoreOutcome =
  | { readonly kind: 'scored'; readonly score: number }
  | { readonly kind: 'unscored'; readonly reason: 'INSUFFICIENT_CONTENT' | 'NO_CLAIMS_FOUND' };

export interface Analysis {
  readonly url: string;
  readonly title: string | null;
  readonly language: SupportedLanguage;
  readonly scoreVersion: string;
  readonly outcome: ScoreOutcome;
  readonly breakdown: ScoreBreakdown;
  readonly sentences: readonly Sentence[];
  readonly classifications: readonly Classification[];
  readonly suggestions: readonly Suggestion[];
  /** `true` quando a chamada de sugestões falhou e o resto foi entregue. */
  readonly suggestionsDegraded: boolean;
  readonly methodology: Methodology;
  readonly durationMs: number;
}

// ─── src/core/domain/errors.ts ─────────────────────────────────────────────

export type AnalysisErrorCode =
  // entrada
  | 'INVALID_URL'
  | 'BLOCKED_HOST'          // localhost, IP privado — proteção SSRF
  // fetch
  | 'FETCH_FAILED'
  | 'FETCH_TIMEOUT'
  | 'NOT_HTML'
  | 'CONTENT_TOO_LARGE'
  // extração
  | 'NO_MAIN_CONTENT'       // paywall, página JS-heavy, boilerplate agressivo
  | 'UNSUPPORTED_LANGUAGE'
  // classificação
  | 'CLASSIFIER_FAILED'
  | 'CLASSIFIER_REFUSED'    // stop_reason === 'refusal'
  | 'CLASSIFIER_INVALID_OUTPUT'  // parsed_output === null
  // guardas
  | 'RATE_LIMITED'
  | 'BUDGET_EXCEEDED';

export class AnalysisError extends Error {
  constructor(
    readonly code: AnalysisErrorCode,
    /** Mensagem para o usuário final, acionável, sem detalhe interno. */
    readonly userMessage: string,
    readonly cause?: unknown,
  ) {
    super(`${code}: ${userMessage}`);
    this.name = 'AnalysisError';
  }
}
```

---

## API Contracts

### Portas de domínio

```typescript
// ─── src/core/ports/content-fetcher.ts ─────────────────────────────────────

export interface FetchedPage {
  readonly finalUrl: string;   // após redirect
  readonly html: string;
  readonly contentType: string;
  readonly byteLength: number;
}

export interface ContentFetcher {
  /** @throws AnalysisError — INVALID_URL, BLOCKED_HOST, FETCH_*, NOT_HTML, CONTENT_TOO_LARGE */
  fetch(url: string): Promise<FetchedPage>;
}

// ─── src/core/ports/content-extractor.ts ───────────────────────────────────

export interface ContentExtractor {
  /** @throws AnalysisError — NO_MAIN_CONTENT, UNSUPPORTED_LANGUAGE */
  extract(page: FetchedPage): Promise<ExtractedContent>;
}

// ─── src/core/ports/sentence-segmenter.ts ──────────────────────────────────

export interface SentenceSegmenter {
  /** Determinístico e sem I/O. Marca `analyzable` por sentença. */
  segment(content: ExtractedContent): readonly Sentence[];
}

// ─── src/core/ports/claim-classifier.ts ────────────────────────────────────

export interface ClassifierUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheCreationInputTokens: number;
  readonly cacheReadInputTokens: number;
}

export interface ClassificationResult {
  readonly classifications: readonly Classification[];
  readonly usage: ClassifierUsage | null;  // null quando nada foi ao LLM
}

export interface ClaimClassifier {
  /** @throws AnalysisError — CLASSIFIER_FAILED, CLASSIFIER_REFUSED, CLASSIFIER_INVALID_OUTPUT */
  classify(
    sentences: readonly Sentence[],
    content: ExtractedContent,
  ): Promise<ClassificationResult>;
}

// ─── src/core/ports/suggestion-writer.ts ───────────────────────────────────

export interface SuggestionResult {
  readonly suggestions: readonly Suggestion[];
  readonly usage: ClassifierUsage | null;
}

export interface SuggestionWriter {
  /**
   * Falha aqui NÃO é fatal: o caso de uso captura e marca
   * `suggestionsDegraded`. Graceful degradation deliberada.
   */
  write(
    unsourced: readonly Sentence[],
    content: ExtractedContent,
  ): Promise<SuggestionResult>;
}

// ─── src/core/ports/rate-limiter.ts ────────────────────────────────────────

export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly retryAfterSeconds: number | null;
}

export interface RateLimiter {
  check(clientKey: string): Promise<RateLimitDecision>;
}

// ─── src/core/ports/budget-guard.ts ────────────────────────────────────────

export interface BudgetDecision {
  readonly allowed: boolean;
  readonly reason: 'ok' | 'daily_cap_reached' | 'request_too_expensive';
  readonly estimatedInputTokens: number;
}

export interface BudgetGuard {
  /** Pré-flight: chamado ANTES de qualquer token ser gasto. */
  authorize(estimatedInputTokens: number): Promise<BudgetDecision>;
}

// ─── src/core/ports/cost-recorder.ts ───────────────────────────────────────

export interface CostRecorder {
  /** Registra uso real por análise. Base do acceptance criteria de M2. */
  record(usage: ClassifierUsage, model: string): Promise<void>;
}

// ─── src/core/ports/clock.ts ───────────────────────────────────────────────

export interface Clock {
  now(): number;
}
```

### Scoring

```typescript
// ─── src/core/scoring/weights.ts ───────────────────────────────────────────

/**
 * ADR-003: ponto ÚNICO dos pesos. Alterar qualquer valor aqui
 * OBRIGA incrementar SCORE_VERSION — sem isso, scores antigos
 * ficam incomparáveis sem que ninguém perceba.
 */
export const SCORE_VERSION = '1.0.0';

export const WEIGHTS = {
  factualDensity: 0.6,
  gapComplement: 0.4,
} as const;

export const MIN_ANALYZABLE_SENTENCES = 10;

// ─── src/core/scoring/compute-score.ts ─────────────────────────────────────

/** Função pura. Sem I/O, sem relógio, sem aleatoriedade. */
export function computeScore(
  classifications: readonly Classification[],
  analyzableCount: number,
): { outcome: ScoreOutcome; breakdown: ScoreBreakdown };
```

### Caso de uso

```typescript
// ─── src/core/usecases/analyze-url.ts ──────────────────────────────────────

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
): (input: AnalyzeUrlInput) => Promise<Analysis>;
```

### Contrato HTTP

```typescript
// ─── src/app/api/analyze/route.ts ──────────────────────────────────────────
// POST /api/analyze     Runtime: nodejs (NÃO edge — Readability precisa de DOM)

export interface AnalyzeRequestBody {
  readonly url: string;
  readonly includeSuggestions?: boolean;  // default true
}

export type AnalyzeResponseBody =
  | { readonly ok: true; readonly analysis: Analysis }
  | { readonly ok: false; readonly error: { readonly code: AnalysisErrorCode; readonly message: string } };
```

**Mapa de `code` para status HTTP** — ponto único na rota:

| Código | HTTP | Cabeçalho extra |
|---|---|---|
| `INVALID_URL`, `BLOCKED_HOST`, `NOT_HTML` | 400 | |
| `CONTENT_TOO_LARGE` | 413 | |
| `NO_MAIN_CONTENT`, `UNSUPPORTED_LANGUAGE` | 422 | |
| `FETCH_FAILED` | 502 | |
| `FETCH_TIMEOUT` | 504 | |
| `RATE_LIMITED` | 429 | `Retry-After` |
| `BUDGET_EXCEEDED` | 503 | `Retry-After` |
| `CLASSIFIER_*` | 502 | |
| inesperado | 500 | corpo genérico, sem detalhe interno |

### Schemas de structured output

```typescript
// ─── src/adapters/classify/schemas.ts ──────────────────────────────────────
import { z } from 'zod';

export const ClassificationItemSchema = z.object({
  id: z.number().int(),
  category: z.enum(['SOURCED', 'UNSOURCED', 'OPINION']),
  confidence: z.number().min(0).max(1),
});

export const ClassificationBatchSchema = z.object({
  items: z.array(ClassificationItemSchema),
});

export const SuggestionItemSchema = z.object({
  id: z.number().int(),
  issue: z.string(),
  action: z.string(),
});

export const SuggestionBatchSchema = z.object({
  items: z.array(SuggestionItemSchema),
});
```

Consumidos via `client.messages.parse({ output_config: { format: zodOutputFormat(ClassificationBatchSchema) } })`, com `zodOutputFormat` importado de `@anthropic-ai/sdk/helpers/zod`.

**`response.parsed_output` pode ser `null`.** Guardar e lançar `CLASSIFIER_INVALID_OUTPUT` — nunca desreferenciar com `!`.

Note que o schema **não** pede justificativa por sentença: é o lever de −35% de saída de [ADR-005](../../decisions/005-modelo-llm-e-custo.md). A explicação exibida na UI vem dos `signals` do pré-filtro, que são gratuitos.

---

## Flow Diagrams

### Fluxo principal — análise de URL

```
 1. POST /api/analyze { url }
 2. Validar corpo (Zod) ................................ → 400 INVALID_URL
 3. Resolver clientKey do IP
 4. rateLimiter.check(clientKey) ....................... → 429 RATE_LIMITED
 5. fetcher.fetch(url)
      ├─ bloquear localhost / IP privado ............... → 400 BLOCKED_HOST
      ├─ timeout ...................................... → 504 FETCH_TIMEOUT
      ├─ content-type não-HTML ........................ → 400 NOT_HTML
      └─ acima do cap de bytes ........................ → 413 CONTENT_TOO_LARGE
 6. extractor.extract(page)
      ├─ sem conteúdo principal ....................... → 422 NO_MAIN_CONTENT
      └─ idioma fora de pt-BR/en ...................... → 422 UNSUPPORTED_LANGUAGE
 7. segmenter.segment(content)  [determinístico, grátis]
      └─ aplicar cap de sentenças analisáveis
 8. countTokens sobre o lote a escalar  [pré-flight]
 9. budgetGuard.authorize(estimado) .................... → 503 BUDGET_EXCEEDED
      ⚠ NENHUM token gasto antes deste ponto
10. classifier.classify(sentences, content)
      ├─ prefilter decide o que consegue  [grátis]
      ├─ escala o ambíguo ao LLM em lote
      ├─ stop_reason === 'refusal' .................... → 502 CLASSIFIER_REFUSED
      └─ parsed_output === null ....................... → 502 CLASSIFIER_INVALID_OUTPUT
11. computeScore(classifications, analyzableCount)  [função pura]
      ├─ N < 10 ....................................... → outcome unscored/INSUFFICIENT_CONTENT
      └─ sourced + unsourced === 0 .................... → outcome unscored/NO_CLAIMS_FOUND
12. suggestionWriter.write(unsourced)  [se solicitado]
      └─ falha ⇒ suggestionsDegraded = true, NÃO propaga
13. costRecorder.record(usage somado, model)
14. 200 { ok: true, analysis }
```

O passo 9 é a fronteira do gasto. Tudo antes dele é grátis; tudo depois custa. Essa fronteira é explícita no código, não emergente.

### Fluxo de calibração — `scripts/calibrate.ts`, acceptance de M2

```
1. Ler tests/fixtures/corpus/ (lista versionada de URLs)
2. Para cada URL: rodar o pipeline com FixtureFetcher (sem rede)
3. Emitir por artigo:
     - score, breakdown, N
     - taxa de escalonamento ao LLM (meta: <= 50%)
     - distribuição por decidedBy
     - usage real e custo em dólares
4. Emitir agregado:
     - custo médio por análise  ← acceptance criteria de M2
     - taxa média de escalonamento
     - cache_read_input_tokens (zero ⇒ invalidador silencioso no prefixo)
5. Exportar CSV sentença-a-sentença para conferência manual
```

O passo 5 é o que torna a validação de ~10 artigos executável em vez de aspiracional: o usuário confere uma planilha, não um JSON.

---

## State Management

**Servidor:** sem estado. A análise é uma função de URL para relatório. Nada persistido entre requisições — não há banco de produto, por decisão de escopo.

Duas exceções, ambas infraestrutura e não estado de produto:
- Contadores de rate limit por IP, com TTL de janela
- Contadores de gasto do budget guard, com TTL diário

**Cliente (M3):** estado local no componente de página, sem store global. Máquina de estados explícita:

```
idle → validating → fetching → extracting → classifying → done
                                                        ↘ error
```

O estágio corrente é exibido porque a análise leva segundos e um spinner mudo em operação de 10s parece travamento. O estado vive na página; nenhum componente de apresentação guarda estado próprio além de interação local (sentença expandida, aba selecionada).

Sem React Query, sem Zustand, sem Context: uma requisição, um resultado, nenhum cache a coordenar. Introduzir biblioteca de estado aqui seria custo sem contrapartida.

---

## Error Handling

**Princípio:** todo erro esperado é `AnalysisError` com `code` de união fechada. Nenhum `throw new Error("...")` solto no domínio. O compilador garante que o mapa de status HTTP cobre todos os códigos via checagem de exaustividade.

| Situação | Código | Mensagem ao usuário |
|---|---|---|
| URL malformada | `INVALID_URL` | Informe uma URL completa, começando com `https://` |
| localhost / IP privado | `BLOCKED_HOST` | Só é possível analisar páginas públicas |
| Página fora do ar / DNS | `FETCH_FAILED` | Não foi possível acessar essa página. Verifique se ela abre no navegador |
| Timeout | `FETCH_TIMEOUT` | A página demorou demais para responder |
| PDF, imagem, JSON | `NOT_HTML` | Esse endereço não é uma página HTML |
| Página gigante | `CONTENT_TOO_LARGE` | Essa página é maior do que o limite de análise |
| Paywall, JS-heavy, boilerplate | `NO_MAIN_CONTENT` | Não foi possível extrair o texto principal. Páginas com paywall ou que carregam o conteúdo por JavaScript não são suportadas |
| Idioma não suportado | `UNSUPPORTED_LANGUAGE` | No momento a análise cobre apenas português e inglês |
| Rate limit | `RATE_LIMITED` | Muitas análises em pouco tempo. Tente novamente em N segundos |
| Teto de gasto | `BUDGET_EXCEEDED` | O limite diário de análises foi atingido. Tente novamente amanhã |
| Recusa do modelo | `CLASSIFIER_REFUSED` | Não foi possível analisar esse conteúdo |
| Schema inválido | `CLASSIFIER_INVALID_OUTPUT` | Falha ao processar a análise. Tente novamente |

`NO_MAIN_CONTENT` é o erro que mais vai aparecer na vida real e o mais fácil de errar: a mensagem tem que dizer **por que** falhou e **qual** classe de página não funciona, senão o usuário culpa o produto e não tenta outra URL.

**Degradação graciosa:** falha em `suggestionWriter` é capturada, logada e sinalizada por `suggestionsDegraded: true`. O relatório entrega score, breakdown e highlight — que é a maior parte do valor. Falha na classificação é fatal por definição: sem classificação não existe relatório.

**Erros do SDK Anthropic:** capturar em cadeia do mais específico para o mais genérico, conforme a orientação do SDK — `RateLimitError`, depois `APIStatusError`, depois `APIConnectionError`. Um `catch` único e largo apaga a distinção entre falha retentável e não retentável, que é exatamente a informação que importa aqui.

---

## Performance Considerations

**Orçamento de latência por análise** (alvo, a validar em M2):

| Estágio | Alvo |
|---|---|
| Fetch + extração | < 3s |
| Segmentação + pré-filtro | < 100ms (local, sem I/O) |
| Classificação LLM | 3–8s |
| Sugestões | 2–5s |
| **Total** | **< 15s** |

`maxDuration` da rota configurado com folga sobre o total. Runtime **Node**, não Edge: o Readability precisa de implementação de DOM e o Edge Runtime não a oferece.

**Otimizações aplicadas**
- Pré-filtro elimina até 50% das chamadas ao LLM — é a otimização de maior impacto e é gratuita.
- Prompt caching no `system` das duas chamadas. Ganho real modesto (~10%), porque a saída domina o custo — ver [ADR-005](../../decisions/005-modelo-llm-e-custo.md).
- Lote único por chamada em vez de uma chamada por sentença.
- Schema sem justificativa por sentença: −35% de saída na classificação.

**Otimizações rejeitadas para o v1**
- Streaming de resultado parcial: complica a UI e o gargalo percebido é o fetch, não a geração.
- Fast mode: dobra o custo do componente que já domina a conta.
- Cache de resultado por URL: exigiria armazenamento de produto, que está fora de escopo. Fica no roadmap junto com o histórico.

**Frontend (M3):** o relatório é uma página, sem roteamento pesado. Highlight inline de centenas de sentenças é o único ponto com risco de custo de render — renderizar por trecho e não por caractere, e virtualizar apenas se a medição mostrar necessidade. Não otimizar antes de medir.

---

## Security Considerations

**SSRF é o risco de segurança número um deste desenho.** O produto aceita uma URL arbitrária de um visitante anônimo e faz uma requisição de servidor para ela. Sem proteção, isso é um proxy aberto para a rede interna de quem hospeda.

Defesas em `HttpContentFetcher`, todas obrigatórias:
- Só `http:` e `https:`. Rejeitar `file:`, `ftp:`, `data:`, `gopher:`
- Resolver o host e **bloquear IP privado, loopback, link-local e metadata** — `127.0.0.0/8`, `10/8`, `172.16/12`, `192.168/16`, `169.254/16` (inclui `169.254.169.254`), `::1`, `fc00::/7`
- Revalidar após **cada redirect**, não só na URL original. Redirect para IP interno é o bypass clássico
- Limite de redirects
- Timeout de conexão e de leitura
- Cap de bytes aplicado **durante** o stream, não após o download completo
- Sem envio de credencial, cookie ou cabeçalho de autenticação
- User-Agent identificando o produto

**Validação de entrada:** corpo da requisição validado por Zod na fronteira. Variáveis de ambiente validadas por Zod na inicialização — falta de `ANTHROPIC_API_KEY` deve derrubar o boot, não produzir 500 na primeira análise real.

**Segredos:** `ANTHROPIC_API_KEY` só no servidor. Nenhuma variável com segredo prefixada `NEXT_PUBLIC_`. `.env.example` sem valores reais. A chamada à Claude API acontece exclusivamente na rota de servidor — o navegador nunca fala com a Anthropic.

**Saída:** o conteúdo extraído é texto de terceiros renderizado na nossa página — é entrada não confiável. O highlight inline deve renderizar texto como texto, nunca `dangerouslySetInnerHTML`. Este é o vetor de XSS do produto.

**Abuso:** rate limit por IP, cap de conteúdo e budget guard, detalhados em [protecao-custo](specs/protecao-custo/spec.md). Os três são bloqueadores de deploy público.

**Privacidade:** sem login, sem cookie de rastreio, sem persistência do conteúdo analisado. A URL analisada aparece em log de aplicação — registrar isso na política antes do deploy público, porque URL pode ser informação sensível.
