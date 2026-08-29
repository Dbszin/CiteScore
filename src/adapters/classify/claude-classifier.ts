import Anthropic from '@anthropic-ai/sdk';

import type {
  ClaimCategory,
  Classification,
} from '../../core/domain/classification.js';
import { analysisError } from '../../core/domain/errors.js';
import type { ExtractedContent } from '../../core/domain/extracted-content.js';
import type { Sentence } from '../../core/domain/sentence.js';
import type {
  ClaimClassifier,
  ClassificationResult,
  ClassifierUsage,
} from '../../core/ports/claim-classifier.js';
import { capabilitiesFor } from './model-capabilities.js';
import { buildClassifySystemPrompt } from './prompts/classify-system.js';
import {
  CLASSIFICATION_OUTPUT_FORMAT,
  ClassificationBatchSchema,
} from './schemas.js';

/**
 * Classificador LLM (ADR-002 / ADR-005).
 *
 * Recebe APENAS as sentenças que o pré-filtro não conseguiu decidir. Nunca é
 * chamado diretamente pelo caso de uso — o `HybridClassifier` o compõe.
 *
 * ==== SUPERFÍCIE DE API: O QUE ESTE SDK REALMENTE ACEITA ====
 *
 * A ADR-005 especificou `output_config.effort: "low"` e thinking adaptativo,
 * assumindo `claude-opus-5` e um SDK mais recente. Duas coisas mudaram:
 *
 * 1. O usuário escolheu `claude-haiku-4-5` em OQ-1, onde `effort` retorna
 *    erro de qualquer forma.
 * 2. O SDK instalado (`@anthropic-ai/sdk` 0.70.1) **não expõe** `effort` nem
 *    `thinking: { type: "adaptive" }` — só `enabled`/`disabled` —, e o
 *    structured output vive em `client.beta.messages.parse` com o parâmetro
 *    `output_format`, não em `client.messages.parse` com `output_config`.
 *
 * Há ainda um terceiro detalhe: o helper `betaZodOutputFormat` do SDK chama
 * `z.toJSONSchema()`, que só existe no Zod 4 — o projeto usa Zod 3.25.x e o
 * helper lança em tempo de execução. O schema vai explícito, de `schemas.ts`.
 *
 * Verificado nas declarações de tipo do pacote instalado, não presumido.
 *
 * Consequência prática: nenhum parâmetro condicional é necessário hoje. Sem
 * thinking é exatamente o que se quer para classificação em lote — mais
 * barato e mais rápido, e a tarefa não pede raciocínio longo.
 * `model-capabilities.ts` documenta as diferenças entre modelos para quando
 * o SDK for atualizado; ver o débito de spec em tasks.md.
 */

/**
 * Superfície mínima do cliente que este adapter usa.
 *
 * Existe para permitir stub em teste sem rede e sem gastar. O cliente real
 * do SDK é estruturalmente compatível.
 */
export interface AnthropicLike {
  readonly beta: {
    readonly messages: {
      parse(params: Record<string, unknown>): Promise<ParsedResponseLike>;
    };
  };
  readonly messages: {
    countTokens(
      params: Record<string, unknown>,
    ): Promise<{ readonly input_tokens: number }>;
  };
}

export interface ParsedResponseLike {
  readonly stop_reason?: string | null | undefined;
  /** O SDK 0.70.1 popula os dois; versões futuras podem manter só um. */
  readonly parsed_output?: unknown;
  readonly parsed?: unknown;
  readonly usage?:
    | {
        readonly input_tokens?: number;
        readonly output_tokens?: number;
        readonly cache_creation_input_tokens?: number | null;
        readonly cache_read_input_tokens?: number | null;
      }
    | undefined;
}

export interface ClaudeClassifierOptions {
  readonly model: string;
  readonly maxSentencesPerCall: number;
  /** Teto de saída por chamada. Lote de ~80 itens cabe folgado em 8000. */
  readonly maxTokens?: number;
}

/**
 * Teto de saída derivado do tamanho do lote, não fixo.
 *
 * Antes era 8.000 constante, sem relação com `maxSentencesPerCall`, que vem
 * do ambiente. Com o lote configurado em 400 (o valor de
 * `MAX_ANALYZABLE_SENTENCES`), a saída precisaria de ~16.000 tokens e seria
 * TRUNCADA — produzindo JSON inválido e um `CLASSIFIER_INVALID_OUTPUT` que
 * aponta para a causa errada.
 */
const TOKENS_PER_ITEM = 40;
const OUTPUT_OVERHEAD_TOKENS = 500;
const MIN_MAX_TOKENS = 1_024;

export function deriveMaxTokens(maxSentencesPerCall: number): number {
  const needed = maxSentencesPerCall * TOKENS_PER_ITEM + OUTPUT_OVERHEAD_TOKENS;
  return Math.max(MIN_MAX_TOKENS, needed);
}

export function createAnthropicClient(apiKey: string): AnthropicLike {
  return new Anthropic({ apiKey }) as unknown as AnthropicLike;
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  const step = size > 0 ? size : items.length;
  for (let i = 0; i < items.length; i += step) {
    out.push(items.slice(i, i + step));
  }
  return out;
}

function emptyUsage(): ClassifierUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
  };
}

function addUsage(
  total: ClassifierUsage,
  response: ParsedResponseLike,
): ClassifierUsage {
  const usage = response.usage;
  return {
    inputTokens: total.inputTokens + (usage?.input_tokens ?? 0),
    outputTokens: total.outputTokens + (usage?.output_tokens ?? 0),
    cacheCreationInputTokens:
      total.cacheCreationInputTokens + (usage?.cache_creation_input_tokens ?? 0),
    cacheReadInputTokens:
      total.cacheReadInputTokens + (usage?.cache_read_input_tokens ?? 0),
  };
}

/**
 * Traduz qualquer falha de transporte do SDK em `CLASSIFIER_FAILED`.
 *
 * A versão anterior tinha sete ramos `instanceof` que produziam TODOS o mesmo
 * código, sob um comentário afirmando preservar a distinção entre falha
 * retentável (429, 5xx, rede) e não retentável (400, 404). O código não
 * preservava nada disso — era a forma sem a substância, e o comentário
 * prometia uma garantia inexistente.
 *
 * A distinção só teria valor se alguém decidisse retry a partir dela, e
 * `AnalysisErrorCode` não tem código para "retentável". Criar um agora seria
 * mudança de contrato sem consumidor. Registrado no débito de spec para o
 * Architect decidir se o produto precisa disso.
 *
 * A classe original do erro é preservada em `cause`, então a informação não
 * se perde para quem investiga — ela apenas não é mais anunciada como
 * decisão de fluxo.
 */
function toDomainError(cause: unknown): never {
  throw analysisError('CLASSIFIER_FAILED', cause);
}

export class ClaudeClassifier implements ClaimClassifier {
  constructor(
    private readonly client: AnthropicLike,
    private readonly options: ClaudeClassifierOptions,
  ) {}

  /** Se o prefixo cacheável tem chance de valer algo neste modelo. */
  cacheIsEffective(systemTokens: number): boolean {
    return systemTokens >= capabilitiesFor(this.options.model).minCacheablePrefixTokens;
  }

  private buildRequest(
    system: string,
    userContent: string,
  ): Record<string, unknown> {
    return {
      model: this.options.model,
      max_tokens:
        this.options.maxTokens ?? deriveMaxTokens(this.options.maxSentencesPerCall),
      // Classificar não é gerar texto: não há valor em variedade de resposta,
      // só em concordar consigo mesmo. Sem isto o SDK usa o default do
      // provedor, e a amostragem produzia leituras diferentes do MESMO texto.
      //
      // MEDIDO, não suposto. Três execuções do artigo do Moz, com as mesmas
      // 100 sentenças analisáveis, deram scores 24, 17 e 25 — e OPINION variou
      // de 41 para 18. A variação no mesmo artigo (8 pontos) era o DOBRO da
      // separação entre artigos de tipos diferentes (4 pontos): o ruído
      // superava o sinal que o produto existe para medir.
      temperature: 0,
      // `cache_control` é enviado mesmo quando o modelo tem prefixo mínimo
      // alto: é inofensivo, e passa a valer sozinho se o tier subir. Em
      // `claude-haiku-4-5` o mínimo é 4096 tokens e a rubrica tem ~800, então
      // NÃO cacheia — falha em silêncio, e está documentado em
      // prompts/classify-system.ts em vez de fingido.
      system: [
        { type: 'text', text: system, cache_control: { type: 'ephemeral' } },
      ],
      messages: [{ role: 'user', content: userContent }],
      output_format: CLASSIFICATION_OUTPUT_FORMAT,
    };
  }

  /** Pré-mede tokens de entrada. Nunca `tiktoken` — é de outro provedor. */
  async estimateInputTokens(
    sentences: readonly Sentence[],
    content: ExtractedContent,
  ): Promise<number> {
    const analyzable = sentences.filter((sentence) => sentence.analyzable);
    if (analyzable.length === 0) return 0;

    const system = buildClassifySystemPrompt(content.language);
    let total = 0;

    for (const batch of chunk(analyzable, this.options.maxSentencesPerCall)) {
      try {
        const counted = await this.client.messages.countTokens({
          model: this.options.model,
          system,
          messages: [{ role: 'user', content: renderBatch(batch) }],
        });
        total += counted.input_tokens;
      } catch (cause) {
        toDomainError(cause);
      }
    }

    return total;
  }

  async classify(
    sentences: readonly Sentence[],
    content: ExtractedContent,
  ): Promise<ClassificationResult> {
    const analyzable = sentences.filter((sentence) => sentence.analyzable);
    if (analyzable.length === 0) {
      return { classifications: [], usage: null };
    }

    const system = buildClassifySystemPrompt(content.language);

    const classifications: Classification[] = [];
    let usage = emptyUsage();

    for (const batch of chunk(analyzable, this.options.maxSentencesPerCall)) {
      let response: ParsedResponseLike;
      try {
        response = await this.client.beta.messages.parse(
          this.buildRequest(system, renderBatch(batch)),
        );
      } catch (cause) {
        // Os lotes anteriores JÁ FORAM PAGOS. Sem levar esse uso junto, a
        // reserva de orçamento seria devolvida integral sobre dinheiro real —
        // ou, na versão anterior, não seria devolvida de jeito nenhum (ADR-009).
        throw analysisError('CLASSIFIER_FAILED', cause, null, usageOuNulo(usage));
      }

      // Contabiliza ANTES de qualquer checagem que possa lançar.
      //
      // A chamada já voltou, então já foi cobrada — inclusive quando a
      // resposta é uma recusa. Somar depois da checagem de recusa fazia o
      // lote recusado não entrar no `partialUsage`, e a liquidação devolvia a
      // reserva sobre dinheiro gasto de verdade. Como `CLASSIFIER_REFUSED` é
      // acionável por quem envia o conteúdo, cada tentativa que provocasse
      // recusa gastaria sem aparecer no contador.
      usage = addUsage(usage, response);

      // A recusa chega como HTTP 200 com `stop_reason: "refusal"`, não como
      // exceção. Precisa ser checada ANTES de olhar o conteúdo.
      if (response.stop_reason === 'refusal') {
        throw analysisError(
          'CLASSIFIER_REFUSED',
          undefined,
          null,
          usageOuNulo(usage),
        );
      }

      const raw = response.parsed_output ?? response.parsed ?? null;
      const parsed = ClassificationBatchSchema.safeParse(raw);
      if (!parsed.success) {
        throw analysisError(
          'CLASSIFIER_INVALID_OUTPUT',
          parsed.error,
          null,
          usageOuNulo(usage),
        );
      }

      // Índices locais 0..N-1 dentro do lote, traduzidos de volta pela
      // posição. `seen` impede DUPLICATA: o modelo pode repetir um índice, e
      // aceitar a repetição produzia mais classificações que sentenças —
      // origem do score 130 medido na revisão.
      const seen = new Set<number>();

      for (const item of parsed.data.items) {
        // Índice fora do lote é descartado: o modelo pode inventar número.
        const sentence = batch[item.id];
        if (sentence === undefined) continue;

        // Repetição do mesmo índice: mantém a primeira ocorrência e descarta
        // as demais. Se o modelo repetiu em vez de responder outro índice, a
        // sentença faltante é detectada pelo `HybridClassifier`, que falha em
        // vez de entregar cobertura parcial como se fosse completa.
        if (seen.has(item.id)) continue;
        seen.add(item.id);

        classifications.push({
          sentenceId: sentence.id,
          category: item.category as ClaimCategory,
          confidence: item.confidence,
          decidedBy: 'llm',
          signals: [],
        });
      }
    }

    return { classifications, usage };
  }
}

/**
 * Renderiza o lote como lista numerada estável.
 *
 * Fica FORA do prefixo cacheável de propósito: é o conteúdo volátil da
 * requisição, e o `cache_control` marca apenas o `system`.
 */
export function renderBatch(sentences: readonly Sentence[]): string {
  // Índices LOCAIS 0..N-1, não o id global do documento.
  //
  // A versão anterior numerava com o id de domínio, que pode chegar a 380 e
  // ser esparso dentro de um lote. Isso aumentava a chance de o modelo errar
  // o eco do número — origem do bug de score acima de 100. Índices locais,
  // densos e pequenos, são muito mais fáceis de reproduzir corretamente,
  // sobretudo num modelo menor como o `claude-haiku-4-5`.
  //
  // A tradução de volta para o id de domínio é feita pela POSIÇÃO no lote,
  // em `classify`.
  const lines = sentences.map(
    (sentence, localIndex) => `[${localIndex}] ${sentence.text}`,
  );
  return `Classifique cada sentença abaixo.\n\n${lines.join('\n')}`;
}

/**
 * `null` quando nenhum lote chegou a ser pago — a distinção importa para a
 * liquidação, que devolve a reserva integral só nesse caso.
 */
function usageOuNulo(usage: ClassifierUsage): ClassifierUsage | null {
  const total =
    usage.inputTokens +
    usage.outputTokens +
    usage.cacheCreationInputTokens +
    usage.cacheReadInputTokens;
  return total === 0 ? null : usage;
}
