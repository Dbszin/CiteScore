import { analysisError, isAnalysisError } from '../../core/domain/errors.js';
import type { ClaimCategory, Classification } from '../../core/domain/classification.js';
import type { ExtractedContent } from '../../core/domain/extracted-content.js';
import type { Sentence } from '../../core/domain/sentence.js';
import type {
  ClaimClassifier,
  ClassificationResult,
  ClassifierUsage,
} from '../../core/ports/claim-classifier.js';
import { buildClassifySystemPrompt } from './prompts/classify-system.js';
import { renderBatch } from './claude-classifier.js';
import {
  CLASSIFICATION_RESPONSE_SCHEMA_GEMINI,
  ClassificationBatchSchema,
} from './schemas.js';

/**
 * Classificador sobre a Generative Language API do Google (Gemini).
 *
 * POR QUE REST E NÃO SDK. O `@google/genai` seria mais uma dependência para
 * fazer três requisições `POST` com corpo JSON. `fetch` já existe no runtime,
 * e o transporte injetado deixa o adapter testável sem rede — mesma escolha
 * que o `ClaudeClassifier` faz ao receber `AnthropicLike` por construtor.
 *
 * O QUE ELE HERDA DO IRMÃO, e por que não é copiar por copiar:
 *
 *  - `temperature: 0`. MEDIDO no Claude: sem isso, o mesmo artigo dava 24, 17
 *    e 25, e a variação interna (8 pontos) era o DOBRO da separação entre
 *    artigos de tipos diferentes (4 pontos). Não há razão para supor que outro
 *    modelo amostrando seja mais estável.
 *  - `renderBatch` com índices LOCAIS 0..N-1. Índice global esparso aumentava
 *    o erro de eco do número e produziu score acima de 100.
 *  - Contabilizar o uso ANTES de qualquer checagem que possa lançar. A chamada
 *    já voltou, então já foi contada na cota — inclusive quando a resposta é
 *    uma recusa (ADR-009).
 *
 * O QUE É NOVO AQUI: cota. Em tier pago, esgotar orçamento é evento raro
 * tratado pela guarda. Em free tier, `RESOURCE_EXHAUSTED` é o modo de falha
 * mais comum do dia, e ele NÃO pode virar `CLASSIFIER_FAILED` — a mensagem
 * daquele código manda tentar de novo, e tentar de novo vai falhar igual.
 */

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

/** Só o que este adapter usa de `fetch`. Injetável, e por isso testável. */
export type GeminiTransport = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{
  readonly ok: boolean;
  readonly status: number;
  text(): Promise<string>;
}>;

export interface GeminiClassifierOptions {
  readonly apiKey: string;
  readonly model: string;
  readonly maxSentencesPerCall: number;
  readonly maxTokens?: number;
  /** Default: `fetch` global. */
  readonly transport?: GeminiTransport;
  /** Espera antes da unica retentativa. Default 1500 ms; 0 em teste. */
  readonly retryDelayMs?: number;
}

/**
 * Marca no texto da causa, e nao um campo novo no erro.
 *
 * `AnalysisError` e' contrato do dominio, e acrescentar campo so' para o retry
 * de um adapter vazaria detalhe de infraestrutura para o nucleo. A marca sai
 * do texto antes de qualquer coisa chegar ao usuario — ela vive so' entre
 * `postarUmaVez` e `postar`.
 */
const MARCA_TRANSITORIA = '[transitorio] ';

function ehTentavelDeNovo(causa: unknown): boolean {
  if (!isAnalysisError(causa)) return false;
  if (causa.code !== 'CLASSIFIER_FAILED') return false;
  const mensagem = causa.cause instanceof Error ? causa.cause.message : '';
  return mensagem.startsWith(MARCA_TRANSITORIA);
}

/**
 * Teto de saída. Mesma aritmética do irmão: ~40 tokens por item mais folga.
 *
 * Estourar aqui não devolve erro — devolve `finishReason: MAX_TOKENS` com JSON
 * TRUNCADO, que falha na validação apontando para a causa errada.
 */
const TOKENS_PER_ITEM = 40;
const OUTPUT_OVERHEAD_TOKENS = 500;
const MIN_MAX_TOKENS = 1_024;

export function deriveMaxOutputTokens(maxSentencesPerCall: number): number {
  const needed = maxSentencesPerCall * TOKENS_PER_ITEM + OUTPUT_OVERHEAD_TOKENS;
  return Math.max(MIN_MAX_TOKENS, needed);
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

function usageOuNulo(usage: ClassifierUsage): ClassifierUsage | null {
  const total =
    usage.inputTokens +
    usage.outputTokens +
    usage.cacheCreationInputTokens +
    usage.cacheReadInputTokens;
  return total === 0 ? null : usage;
}

function objeto(valor: unknown): Record<string, unknown> | null {
  return typeof valor === 'object' && valor !== null
    ? (valor as Record<string, unknown>)
    : null;
}

function inteiro(valor: unknown): number {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : 0;
}

/**
 * `finishReason` que significam "o modelo se recusou", e não "deu erro".
 *
 * Igual ao `stop_reason: 'refusal'` do Claude, chegam com HTTP 200 — se não
 * forem checados, o código segue para o parse e reporta
 * `CLASSIFIER_INVALID_OUTPUT`, que culpa o formato por uma decisão de conteúdo.
 */
const RECUSAS = new Set([
  'SAFETY',
  'RECITATION',
  'BLOCKLIST',
  'PROHIBITED_CONTENT',
  'SPII',
  'IMAGE_SAFETY',
]);

/** Cota esgotada, na forma em que a API a reporta. */
function ehCotaEsgotada(status: number, corpo: unknown): boolean {
  if (status === 429) return true;
  const erro = objeto(objeto(corpo)?.['error']);
  return erro?.['status'] === 'RESOURCE_EXHAUSTED';
}

/**
 * Falha TRANSITORIA do provedor — vale tentar de novo uma vez.
 *
 * MEDIDO, duas vezes no mesmo dia e no mesmo artigo grande: a API devolveu
 * `503 UNAVAILABLE` com "The request timed out. Please try again.". Na
 * semeadura da vitrine a segunda tentativa passou; na calibracao nao houve
 * segunda tentativa, e o artigo saiu da amostra como CLASSIFIER_FAILED.
 *
 * Sem retry, um lote que expira derruba a ANALISE INTEIRA — e o usuario refaz
 * tudo, inclusive os lotes que ja tinham dado certo. Com uma tentativa, o caso
 * comum se resolve sozinho.
 *
 * 429 NAO entra aqui de proposito: cota esgotada nao melhora tentando de novo,
 * e insistir so' queimaria o que restou.
 */
function ehTransitorio(status: number, corpo: unknown): boolean {
  if (status === 503 || status === 504) return true;
  const erro = objeto(objeto(corpo)?.['error']);
  const estado = erro?.['status'];
  return estado === 'UNAVAILABLE' || estado === 'DEADLINE_EXCEEDED';
}

/**
 * Modelo inexistente, aposentado ou fora do alcance desta chave.
 *
 * MEDIDO, nao hipotetico: o Gemini aposentou `gemini-2.0-flash` durante o
 * desenvolvimento e passou a devolver 404 com NOT_FOUND. Sem esta distincao o
 * caso virava CLASSIFIER_FAILED, cuja mensagem manda tentar de novo — e tentar
 * de novo nunca resolveria, porque o remedio e' trocar a configuracao.
 *
 * 403 entra junto: chave sem permissao para o modelo tem o mesmo remedio.
 */
function ehIndisponivel(status: number, corpo: unknown): boolean {
  if (status === 404 || status === 403) return true;
  const erro = objeto(objeto(corpo)?.['error']);
  const estado = erro?.['status'];
  return estado === 'NOT_FOUND' || estado === 'PERMISSION_DENIED';
}

export class GeminiClassifier implements ClaimClassifier {
  private readonly transport: GeminiTransport;

  constructor(private readonly options: GeminiClassifierOptions) {
    this.transport =
      options.transport ??
      ((url, init) =>
        fetch(url, { method: init.method, headers: init.headers, body: init.body }));
  }

  /**
   * Uma tentativa extra, so' para falha transitoria. Ver `ehTransitorio`.
   *
   * A espera existe para nao repetir no mesmo instante em que o provedor ja'
   * esta' engasgado — repetir imediatamente costuma achar o mesmo problema.
   */
  private async postar(
    metodo: 'generateContent' | 'countTokens',
    corpo: unknown,
    jaPago: ClassifierUsage,
  ): Promise<Record<string, unknown>> {
    try {
      return await this.postarUmaVez(metodo, corpo, jaPago);
    } catch (causa) {
      if (!ehTentavelDeNovo(causa)) throw causa;
      await this.esperar(this.options.retryDelayMs ?? 1_500);
      return this.postarUmaVez(metodo, corpo, jaPago);
    }
  }

  private async esperar(ms: number): Promise<void> {
    if (ms <= 0) return;
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async postarUmaVez(
    metodo: 'generateContent' | 'countTokens',
    corpo: unknown,
    jaPago: ClassifierUsage,
  ): Promise<Record<string, unknown>> {
    const url = `${ENDPOINT}/${encodeURIComponent(this.options.model)}:${metodo}`;

    let resposta: Awaited<ReturnType<GeminiTransport>>;
    try {
      resposta = await this.transport(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          // Cabeçalho, e não `?key=` na URL: query string vaza em log de
          // proxy, em histórico e em relatório de erro.
          'x-goog-api-key': this.options.apiKey,
        },
        body: JSON.stringify(corpo),
      });
    } catch (cause) {
      throw analysisError('CLASSIFIER_FAILED', cause, null, usageOuNulo(jaPago));
    }

    const texto = await resposta.text();
    let json: unknown = null;
    try {
      json = JSON.parse(texto) as unknown;
    } catch {
      json = null;
    }

    if (!resposta.ok) {
      if (ehCotaEsgotada(resposta.status, json)) {
        throw analysisError(
          'CLASSIFIER_QUOTA_EXHAUSTED',
          new Error(texto.slice(0, 400)),
          null,
          usageOuNulo(jaPago),
        );
      }
      if (ehIndisponivel(resposta.status, json)) {
        throw analysisError(
          'CLASSIFIER_UNAVAILABLE',
          new Error(texto.slice(0, 400)),
          null,
          usageOuNulo(jaPago),
        );
      }
      throw analysisError(
        'CLASSIFIER_FAILED',
        new Error(
          `${ehTransitorio(resposta.status, json) ? MARCA_TRANSITORIA : ''}` +
            `HTTP ${resposta.status}: ${texto.slice(0, 400)}`,
        ),
        null,
        usageOuNulo(jaPago),
      );
    }

    const corpoOk = objeto(json);
    if (corpoOk === null) {
      throw analysisError(
        'CLASSIFIER_INVALID_OUTPUT',
        new Error('resposta não é um objeto JSON'),
        null,
        usageOuNulo(jaPago),
      );
    }
    return corpoOk;
  }

  private conteudo(system: string, userContent: string): Record<string, unknown> {
    return {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: userContent }] }],
    };
  }

  /** Pré-mede tokens de entrada pelo tokenizador DO PROVEDOR, nunca por estimativa. */
  async estimateInputTokens(
    sentences: readonly Sentence[],
    content: ExtractedContent,
  ): Promise<number> {
    const analyzable = sentences.filter((sentence) => sentence.analyzable);
    if (analyzable.length === 0) return 0;

    const system = buildClassifySystemPrompt(content.language);
    let total = 0;

    for (const batch of chunk(analyzable, this.options.maxSentencesPerCall)) {
      /*
       * `countTokens` NAO aceita `systemInstruction` no topo do corpo — devolve
       * 400 "Unknown name systemInstruction". Ele exige o envelope
       * `generateContentRequest`, que e' onde o campo existe.
       *
       * Isso NAO e' detalhe de forma: a rubrica do sistema tem ~800 tokens e e'
       * a maior parte da entrada. Contar sem ela subestimaria o custo, e a
       * guarda de orcamento — que decide a partir desta contagem — cobraria a
       * menos em toda analise. Erro de contabilidade silencioso, do tipo que so'
       * aparece na fatura.
       *
       * O modelo vai prefixado com `models/` aqui dentro, ao contrario da URL.
       */
      const corpo = await this.postar(
        'countTokens',
        {
          generateContentRequest: {
            model: `models/${this.options.model}`,
            ...this.conteudo(system, renderBatch(batch)),
          },
        },
        emptyUsage(),
      );
      total += inteiro(corpo['totalTokens']);
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
      const corpo = await this.postar(
        'generateContent',
        {
          ...this.conteudo(system, renderBatch(batch)),
          generationConfig: {
            temperature: 0,
            /*
             * Desliga o raciocinio. E' o mesmo lever de custo da ADR-005
             * aplicado a este provedor, e aqui ele tambem e' de CORRETUDE.
             *
             * MEDIDO contra a API real, num lote de 20 sentencas:
             *   com pensamento : 473 de saida + 461 de pensamento = 1371 total
             *   thinkingBudget 0: 453 de saida +   0 de pensamento =  890 total
             *
             * O pensamento custava quase tanto quanto a resposta, para uma
             * resposta praticamente identica — e, pior, ele conta contra
             * `maxOutputTokens`. Num lote de 80 sentencas isso estourava o
             * teto e a saida vinha TRUNCADA, com o JSON pela metade. Foi assim
             * que o primeiro pipeline real falhou.
             *
             * Classificar em tres categorias nao precisa de cadeia de
             * raciocinio: a decisao esta na presenca de marcador de fonte na
             * propria frase.
             */
            thinkingConfig: { thinkingBudget: 0 },
            maxOutputTokens:
              this.options.maxTokens ??
              deriveMaxOutputTokens(this.options.maxSentencesPerCall),
            responseMimeType: 'application/json',
            responseSchema: CLASSIFICATION_RESPONSE_SCHEMA_GEMINI,
          },
        },
        usage,
      );

      // ANTES de qualquer checagem que possa lançar: a chamada voltou, então
      // já contou na cota, inclusive se o conteúdo for uma recusa (ADR-009).
      usage = somarUso(usage, corpo);

      const bloqueio = objeto(corpo['promptFeedback'])?.['blockReason'];
      if (typeof bloqueio === 'string') {
        throw analysisError(
          'CLASSIFIER_REFUSED',
          new Error(`promptFeedback.blockReason=${bloqueio}`),
          null,
          usageOuNulo(usage),
        );
      }

      const candidatos = corpo['candidates'];
      const primeiro = Array.isArray(candidatos) ? objeto(candidatos[0]) : null;
      if (primeiro === null) {
        throw analysisError(
          'CLASSIFIER_INVALID_OUTPUT',
          new Error('resposta sem candidates'),
          null,
          usageOuNulo(usage),
        );
      }

      const motivo = primeiro['finishReason'];
      if (typeof motivo === 'string' && RECUSAS.has(motivo)) {
        throw analysisError(
          'CLASSIFIER_REFUSED',
          new Error(`finishReason=${motivo}`),
          null,
          usageOuNulo(usage),
        );
      }
      if (motivo === 'MAX_TOKENS') {
        // O JSON veio TRUNCADO. Deixar cair no parse reportaria formato
        // inválido, que culpa o modelo por um teto que nós definimos.
        throw analysisError(
          'CLASSIFIER_INVALID_OUTPUT',
          new Error('saída truncada por maxOutputTokens'),
          null,
          usageOuNulo(usage),
        );
      }

      const parsed = ClassificationBatchSchema.safeParse(
        extrairJson(primeiro),
      );
      if (!parsed.success) {
        throw analysisError(
          'CLASSIFIER_INVALID_OUTPUT',
          parsed.error,
          null,
          usageOuNulo(usage),
        );
      }

      // `seen` impede DUPLICATA: o modelo pode repetir um índice, e aceitar a
      // repetição produzia mais classificações que sentenças — origem do score
      // 130 medido numa revisão anterior.
      const seen = new Set<number>();

      for (const item of parsed.data.items) {
        const sentence = batch[item.id];
        if (sentence === undefined) continue;
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
 * O JSON da resposta vem como TEXTO dentro de `parts`, mesmo com
 * `responseMimeType: application/json` — a API garante que o texto é JSON
 * válido, não que ele venha desserializado.
 */
function extrairJson(candidato: Record<string, unknown>): unknown {
  const partes = objeto(candidato['content'])?.['parts'];
  if (!Array.isArray(partes)) return null;

  const texto = partes
    .map((parte) => objeto(parte)?.['text'])
    .filter((t): t is string => typeof t === 'string')
    .join('');

  if (texto === '') return null;
  try {
    return JSON.parse(texto) as unknown;
  } catch {
    return null;
  }
}

/**
 * `usageMetadata` do Gemini traduzido para o contrato da porta.
 *
 * `cacheCreationInputTokens` fica em zero porque o cache implícito do Gemini
 * não reporta criação separada — e inventar um número aqui corromperia a
 * liquidação da reserva, que soma os quatro campos.
 */
function somarUso(
  total: ClassifierUsage,
  corpo: Record<string, unknown>,
): ClassifierUsage {
  const meta = objeto(corpo['usageMetadata']);
  return {
    inputTokens: total.inputTokens + inteiro(meta?.['promptTokenCount']),
    outputTokens: total.outputTokens + inteiro(meta?.['candidatesTokenCount']),
    cacheCreationInputTokens: total.cacheCreationInputTokens,
    cacheReadInputTokens:
      total.cacheReadInputTokens + inteiro(meta?.['cachedContentTokenCount']),
  };
}
