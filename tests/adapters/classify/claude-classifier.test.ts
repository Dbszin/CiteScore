import { describe, expect, it } from 'vitest';

import {
  ClaudeClassifier,
  renderBatch,
  type AnthropicLike,
  type ParsedResponseLike,
} from '../../../src/adapters/classify/claude-classifier.js';
import { capabilitiesFor } from '../../../src/adapters/classify/model-capabilities.js';
import { AnalysisError } from '../../../src/core/domain/errors.js';
import type { ExtractedContent } from '../../../src/core/domain/extracted-content.js';
import type { Sentence } from '../../../src/core/domain/sentence.js';

/**
 * Todos os testes usam STUB do cliente: sem rede, sem gasto na conta do
 * usuário. O que se prova aqui é a forma da requisição e o tratamento das
 * respostas — inclusive as respostas ruins, que são o que mais importa.
 */

interface StubCall {
  readonly params: Record<string, unknown>;
}

function stubClient(
  responder: (call: number, params: Record<string, unknown>) => ParsedResponseLike,
): { client: AnthropicLike; calls: StubCall[] } {
  const calls: StubCall[] = [];
  const client: AnthropicLike = {
    beta: {
      messages: {
        async parse(params) {
          calls.push({ params });
          return responder(calls.length, params);
        },
      },
    },
    messages: {
      async countTokens() {
        return { input_tokens: 1234 };
      },
    },
  };
  return { client, calls };
}

function content(language: 'pt-BR' | 'en' = 'pt-BR'): ExtractedContent {
  return {
    url: 'https://exemplo.test/a',
    title: 'Artigo',
    text: '',
    language,
    wordCount: 500,
    shape: {
      readerable: true,
      linkCount: 4,
      headingCount: 2,
      charsPerWord: 6,
      linksPerWord: 0.01,
    },
  };
}

function sentences(count: number, startId = 0): Sentence[] {
  return Array.from({ length: count }, (_, index) => ({
    id: startId + index,
    text: `Sentença número ${startId + index} com conteúdo suficiente.`,
    start: 0,
    end: 10,
    analyzable: true,
  }));
}

function okResponse(ids: readonly number[]): ParsedResponseLike {
  return {
    stop_reason: 'end_turn',
    parsed_output: {
      items: ids.map((id) => ({ id, category: 'UNSOURCED', confidence: 0.8 })),
    },
    usage: {
      input_tokens: 100,
      output_tokens: 50,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
  };
}

const OPTIONS = { model: 'claude-haiku-4-5', maxSentencesPerCall: 3 };

describe('ClaudeClassifier — forma da requisição', () => {
  it('marca o system com cache_control e deixa as sentenças fora do prefixo', async () => {
    const { client, calls } = stubClient(() => okResponse([0, 1]));
    const classifier = new ClaudeClassifier(client, OPTIONS);
    await classifier.classify(sentences(2), content());

    const params = calls[0]?.params ?? {};
    const system = params['system'] as { text: string; cache_control: unknown }[];
    expect(system[0]?.cache_control).toEqual({ type: 'ephemeral' });
    // O conteúdo volátil vive na mensagem, não no prefixo cacheável.
    expect(system[0]?.text).not.toContain('Sentença número');
    expect(JSON.stringify(params['messages'])).toContain('Sentença número');
  });

  it('usa structured output', async () => {
    const { client, calls } = stubClient(() => okResponse([0]));
    await new ClaudeClassifier(client, OPTIONS).classify(sentences(1), content());
    // O SDK 0.70.1 usa `output_format`, nao `output_config.format`.
    expect(calls[0]?.params['output_format']).toBeDefined();
  });
});

describe('ClaudeClassifier — parâmetros que o SDK instalado aceita', () => {
  /**
   * A ADR-005 especificou `effort: "low"` e thinking adaptativo, assumindo
   * `claude-opus-5` e um SDK mais recente. O SDK instalado (0.70.1) NÃO
   * expõe nenhum dos dois, e o `claude-haiku-4-5` escolhido em OQ-1 também
   * não suporta `effort`. Estes testes travam o que de fato é enviado, para
   * que um upgrade de SDK não reintroduza um parâmetro inválido em silêncio.
   */
  const MODELOS = ['claude-haiku-4-5', 'claude-opus-5', 'modelo-inexistente-9'];

  for (const model of MODELOS) {
    it(`nao envia effort, thinking nem fallbacks em ${model}`, async () => {
      const { client, calls } = stubClient(() => okResponse([0]));
      await new ClaudeClassifier(client, {
        model,
        maxSentencesPerCall: 10,
      }).classify(sentences(1), content());

      const params = calls[0]?.params ?? {};
      expect(params['thinking']).toBeUndefined();
      expect(params['fallbacks']).toBeUndefined();
      expect(params['betas']).toBeUndefined();
      expect(params['output_config']).toBeUndefined();
    });
  }

  it('envia o modelo configurado, sem hardcode', async () => {
    const { client, calls } = stubClient(() => okResponse([0]));
    await new ClaudeClassifier(client, {
      model: 'claude-haiku-4-5',
      maxSentencesPerCall: 10,
    }).classify(sentences(1), content());
    expect(calls[0]?.params['model']).toBe('claude-haiku-4-5');
  });
});

describe('ClaudeClassifier — honestidade sobre cache', () => {
  it('reporta que a rubrica NAO cacheia em haiku-4-5', () => {
    const { client } = stubClient(() => okResponse([0]));
    const haiku = new ClaudeClassifier(client, {
      model: 'claude-haiku-4-5',
      maxSentencesPerCall: 10,
    });
    // Rubrica tem ~800 tokens; o minimo do haiku e 4096.
    expect(haiku.cacheIsEffective(800)).toBe(false);
    expect(haiku.cacheIsEffective(5000)).toBe(true);
  });

  it('a mesma rubrica cachearia em opus-5', () => {
    const { client } = stubClient(() => okResponse([0]));
    const opus = new ClaudeClassifier(client, {
      model: 'claude-opus-5',
      maxSentencesPerCall: 10,
    });
    expect(opus.cacheIsEffective(800)).toBe(true);
  });
});

describe('capabilitiesFor', () => {
  it('haiku-4-5 exige o maior prefixo cacheável da tabela', () => {
    // 4096 tokens — a rubrica tem ~800, então NÃO cacheia nesse modelo.
    // Documentado em prompts/classify-system.ts em vez de fingido.
    expect(capabilitiesFor('claude-haiku-4-5').minCacheablePrefixTokens).toBe(4096);
    expect(capabilitiesFor('claude-opus-5').minCacheablePrefixTokens).toBe(512);
  });

  it('o mínimo cacheável não é monotônico entre gerações', () => {
    const opus5 = capabilitiesFor('claude-opus-5').minCacheablePrefixTokens;
    const opus46 = capabilitiesFor('claude-opus-4-6').minCacheablePrefixTokens;
    expect(opus5).toBeLessThan(opus46);
  });
});

describe('ClaudeClassifier — particionamento', () => {
  it('divide o lote por maxSentencesPerCall', async () => {
    // O modelo responde com indices LOCAIS 0..N-1 do lote, nao com o id
    // global do documento — mudanca feita para reduzir erro de eco do modelo.
    const { client, calls } = stubClient((call) => {
      const tamanho = call < 3 ? 3 : 1; // 7 sentencas, lotes de 3,3,1
      return okResponse(Array.from({ length: tamanho }, (_, i) => i));
    });
    const classifier = new ClaudeClassifier(client, OPTIONS);
    const result = await classifier.classify(sentences(7), content());

    expect(calls).toHaveLength(3);
    expect(result.classifications).toHaveLength(7);
    // Os ids de DOMINIO sao reconstruidos pela posicao no lote.
    expect(result.classifications.map((c) => c.sentenceId).sort((a, b) => a - b))
      .toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('soma o usage de todas as chamadas', async () => {
    const { client } = stubClient(() => okResponse([0, 1, 2]));
    const result = await new ClaudeClassifier(client, OPTIONS).classify(
      sentences(6),
      content(),
    );
    // 2 chamadas x 100 input / 50 output
    expect(result.usage?.inputTokens).toBe(200);
    expect(result.usage?.outputTokens).toBe(100);
  });

  it('não chama a API quando não há sentença analisável', async () => {
    const { client, calls } = stubClient(() => okResponse([]));
    const naoAnalisavel: Sentence[] = [
      { id: 0, text: 'Título', start: 0, end: 6, analyzable: false, excludedReason: 'heading' },
    ];
    const result = await new ClaudeClassifier(client, OPTIONS).classify(
      naoAnalisavel,
      content(),
    );
    expect(calls).toHaveLength(0);
    expect(result.usage).toBeNull();
  });
});

describe('ClaudeClassifier — respostas ruins', () => {
  async function expectCode(promise: Promise<unknown>, code: string) {
    await expect(promise).rejects.toBeInstanceOf(AnalysisError);
    await promise.catch((error: unknown) => {
      expect((error as AnalysisError).code).toBe(code);
    });
  }

  it('recusa do modelo vira CLASSIFIER_REFUSED', async () => {
    // A recusa chega como HTTP 200 com stop_reason, não como exceção.
    const { client } = stubClient(() => ({
      stop_reason: 'refusal',
      parsed_output: null,
    }));
    await expectCode(
      new ClaudeClassifier(client, OPTIONS).classify(sentences(1), content()),
      'CLASSIFIER_REFUSED',
    );
  });

  /**
   * A Anthropic COBRA os tokens de entrada de uma recusa. Se o uso do lote
   * recusado não subir junto com o erro, a liquidação devolve a reserva sobre
   * dinheiro que foi gasto — o furo que a ADR-009 fechou, por outra porta.
   *
   * E `CLASSIFIER_REFUSED` é acionável por quem envia o conteúdo: cada
   * tentativa que provoque recusa gastaria de verdade sem aparecer no
   * contador.
   */
  it('a recusa carrega o uso do lote que JÁ FOI PAGO', async () => {
    const { client } = stubClient(() => ({
      stop_reason: 'refusal',
      parsed_output: null,
      usage: { input_tokens: 2_000, output_tokens: 15 },
    }));

    let capturado: AnalysisError | null = null;
    await new ClaudeClassifier(client, OPTIONS)
      .classify(sentences(1), content())
      .catch((error: unknown) => {
        capturado = error as AnalysisError;
      });

    const erro = capturado as AnalysisError | null;
    expect(erro?.code).toBe('CLASSIFIER_REFUSED');
    // `null` aqui significaria "nada foi gasto", e a reserva voltaria integral.
    expect(erro?.partialUsage).not.toBeNull();
    expect(erro?.partialUsage?.inputTokens).toBe(2_000);
    expect(erro?.partialUsage?.outputTokens).toBe(15);
  });

  it('a recusa no SEGUNDO lote soma o primeiro e o recusado', async () => {
    // 2 sentenças com lote de 1: duas chamadas. A primeira passa, a segunda
    // recusa. O uso reportado precisa conter as duas.
    const { client } = stubClient((chamada) =>
      chamada === 1
        ? {
            stop_reason: 'end_turn',
            parsed_output: { items: [{ id: 0, category: 'SOURCED', confidence: 1 }] },
            usage: { input_tokens: 1_000, output_tokens: 10 },
          }
        : {
            stop_reason: 'refusal',
            parsed_output: null,
            usage: { input_tokens: 900, output_tokens: 5 },
          },
    );

    let capturado: AnalysisError | null = null;
    await new ClaudeClassifier(client, { ...OPTIONS, maxSentencesPerCall: 1 })
      .classify(sentences(2), content())
      .catch((error: unknown) => {
        capturado = error as AnalysisError;
      });

    const erro = capturado as AnalysisError | null;
    expect(erro?.code).toBe('CLASSIFIER_REFUSED');
    expect(erro?.partialUsage?.inputTokens).toBe(1_900);
    expect(erro?.partialUsage?.outputTokens).toBe(15);
  });

  it('checa a recusa ANTES de olhar o conteúdo', async () => {
    // parsed_output válido junto com refusal: a recusa tem precedência.
    const { client } = stubClient(() => ({
      stop_reason: 'refusal',
      parsed_output: { items: [{ id: 0, category: 'SOURCED', confidence: 1 }] },
    }));
    await expectCode(
      new ClaudeClassifier(client, OPTIONS).classify(sentences(1), content()),
      'CLASSIFIER_REFUSED',
    );
  });

  it('parsed_output nulo vira CLASSIFIER_INVALID_OUTPUT', async () => {
    const { client } = stubClient(() => ({
      stop_reason: 'end_turn',
      parsed_output: null,
    }));
    await expectCode(
      new ClaudeClassifier(client, OPTIONS).classify(sentences(1), content()),
      'CLASSIFIER_INVALID_OUTPUT',
    );
  });

  it('categoria inválida vira CLASSIFIER_INVALID_OUTPUT', async () => {
    const { client } = stubClient(() => ({
      stop_reason: 'end_turn',
      parsed_output: { items: [{ id: 0, category: 'TALVEZ', confidence: 0.5 }] },
    }));
    await expectCode(
      new ClaudeClassifier(client, OPTIONS).classify(sentences(1), content()),
      'CLASSIFIER_INVALID_OUTPUT',
    );
  });

  it('confidence fora de 0..1 vira CLASSIFIER_INVALID_OUTPUT', async () => {
    const { client } = stubClient(() => ({
      stop_reason: 'end_turn',
      parsed_output: { items: [{ id: 0, category: 'SOURCED', confidence: 7 }] },
    }));
    await expectCode(
      new ClaudeClassifier(client, OPTIONS).classify(sentences(1), content()),
      'CLASSIFIER_INVALID_OUTPUT',
    );
  });

  it('DESCARTA item com índice fora do lote', async () => {
    // O modelo pode inventar número. Aceitar corromperia o score em silêncio.
    const { client } = stubClient(() => ({
      stop_reason: 'end_turn',
      parsed_output: {
        items: [
          { id: 0, category: 'SOURCED', confidence: 0.9 },
          { id: 999, category: 'SOURCED', confidence: 0.9 },
        ],
      },
      usage: { input_tokens: 10, output_tokens: 5 },
    }));
    const result = await new ClaudeClassifier(client, OPTIONS).classify(
      sentences(1),
      content(),
    );
    expect(result.classifications).toHaveLength(1);
    expect(result.classifications[0]?.sentenceId).toBe(0);
  });

  it('erro de rede vira CLASSIFIER_FAILED', async () => {
    const client: AnthropicLike = {
      beta: {
        messages: {
          async parse() {
            throw new Error('socket hang up');
          },
        },
      },
      messages: {
        async countTokens() {
          return { input_tokens: 0 };
        },
      },
    };
    await expectCode(
      new ClaudeClassifier(client, OPTIONS).classify(sentences(1), content()),
      'CLASSIFIER_FAILED',
    );
  });
});

describe('ClaudeClassifier — classificações produzidas', () => {
  it('marca tudo como decidedBy llm', async () => {
    const { client } = stubClient(() => okResponse([0, 1]));
    const result = await new ClaudeClassifier(client, OPTIONS).classify(
      sentences(2),
      content(),
    );
    for (const classification of result.classifications) {
      expect(classification.decidedBy).toBe('llm');
    }
  });

  it('preserva a confiança reportada pelo modelo', async () => {
    const { client } = stubClient(() => ({
      stop_reason: 'end_turn',
      parsed_output: { items: [{ id: 0, category: 'UNSOURCED', confidence: 0.42 }] },
      usage: { input_tokens: 1, output_tokens: 1 },
    }));
    const result = await new ClaudeClassifier(client, OPTIONS).classify(
      sentences(1),
      content(),
    );
    expect(result.classifications[0]?.confidence).toBe(0.42);
  });
});

describe('renderBatch', () => {
  it('numera com índices LOCAIS 0..N-1, não com o id de domínio', () => {
    // Ids globais podem ser 380 e esparsos; locais sao densos e pequenos, o
    // que reduz o erro de eco do modelo — origem do bug de score > 100.
    const rendered = renderBatch(sentences(2, 5));
    expect(rendered).toContain('[0]');
    expect(rendered).toContain('[1]');
    expect(rendered).not.toContain('[5]');
  });

  it('é determinístico — o prefixo de cache depende disso', () => {
    const batch = sentences(3);
    expect(renderBatch(batch)).toBe(renderBatch(batch));
  });
});

describe('estimateInputTokens', () => {
  it('usa countTokens, nunca um tokenizador de outro provedor', async () => {
    const { client } = stubClient(() => okResponse([0]));
    const total = await new ClaudeClassifier(client, OPTIONS).estimateInputTokens(
      sentences(7),
      content(),
    );
    // 7 sentenças / lote de 3 = 3 chamadas x 1234
    expect(total).toBe(3 * 1234);
  });

  it('devolve zero sem sentenças', async () => {
    const { client } = stubClient(() => okResponse([]));
    const total = await new ClaudeClassifier(client, OPTIONS).estimateInputTokens(
      [],
      content(),
    );
    expect(total).toBe(0);
  });
});
