import { describe, expect, it } from 'vitest';

import {
  GeminiClassifier,
  deriveMaxOutputTokens,
  type GeminiTransport,
} from '../../../src/adapters/classify/gemini-classifier.js';
import { AnalysisError } from '../../../src/core/domain/errors.js';
import type { ExtractedContent } from '../../../src/core/domain/extracted-content.js';
import type { Sentence } from '../../../src/core/domain/sentence.js';

/**
 * Transporte FALSO em todos os casos: sem rede, sem consumir cota da conta de
 * ninguém. O que se prova aqui é a forma da requisição e o tratamento das
 * respostas — sobretudo as ruins, que são o que mais importa num free tier,
 * onde a resposta ruim mais comum é "cota esgotada".
 *
 * ⚠️ LIMITE DESTE ARQUIVO, e é importante saber antes de confiar: um stub não
 * valida o `responseSchema` que enviamos, nem prova que o endpoint existe com
 * esse nome. Isso só uma chamada real prova — `scripts/smoke-gemini.ts`.
 */

interface Chamada {
  readonly url: string;
  readonly headers: Record<string, string>;
  readonly body: Record<string, unknown>;
}

function transporte(
  responder: (n: number, chamada: Chamada) => { status?: number; corpo: unknown },
): { transport: GeminiTransport; calls: Chamada[] } {
  const calls: Chamada[] = [];
  const transport: GeminiTransport = async (url, init) => {
    const chamada: Chamada = {
      url,
      headers: init.headers,
      body: JSON.parse(init.body) as Record<string, unknown>,
    };
    calls.push(chamada);
    const { status = 200, corpo } = responder(calls.length, chamada);
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(corpo),
    };
  };
  return { transport, calls };
}

function content(): ExtractedContent {
  return {
    url: 'https://exemplo.test/a',
    title: 'Artigo',
    text: '',
    language: 'pt-BR',
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

/** Resposta feliz: o JSON vem como TEXTO dentro de `parts`. */
function respostaOk(
  ids: readonly number[],
  uso = { promptTokenCount: 100, candidatesTokenCount: 50 },
): unknown {
  return {
    candidates: [
      {
        finishReason: 'STOP',
        content: {
          parts: [
            {
              text: JSON.stringify({
                items: ids.map((id) => ({
                  id,
                  category: 'UNSOURCED',
                  confidence: 0.8,
                })),
              }),
            },
          ],
        },
      },
    ],
    usageMetadata: uso,
  };
}

const OPCOES = { apiKey: 'AIza-teste', model: 'gemini-2.5-flash', maxSentencesPerCall: 3 };

function classificador(transport: GeminiTransport): GeminiClassifier {
  return new GeminiClassifier({ ...OPCOES, transport });
}

describe('GeminiClassifier — forma da requisição', () => {
  it('manda temperature 0', async () => {
    // MEDIDO no irmão: sem isso, o mesmo artigo deu 24, 17 e 25, e a variação
    // interna era o DOBRO da separação entre artigos diferentes. Amostrar é o
    // oposto do que este produto precisa.
    const { transport, calls } = transporte(() => ({ corpo: respostaOk([0]) }));
    await classificador(transport).classify(sentences(1), content());

    const config = calls[0]?.body['generationConfig'] as Record<string, unknown>;
    expect(config['temperature']).toBe(0);
  });

  it('manda o responseSchema e pede JSON', async () => {
    const { transport, calls } = transporte(() => ({ corpo: respostaOk([0]) }));
    await classificador(transport).classify(sentences(1), content());

    const config = calls[0]?.body['generationConfig'] as Record<string, unknown>;
    expect(config['responseMimeType']).toBe('application/json');
    expect(config['responseSchema']).toBeDefined();
  });

  it('a chave vai no CABEÇALHO, nunca na URL', async () => {
    // Query string vaza em log de proxy, em histórico e em relatório de erro.
    const { transport, calls } = transporte(() => ({ corpo: respostaOk([0]) }));
    await classificador(transport).classify(sentences(1), content());

    expect(calls[0]?.headers['x-goog-api-key']).toBe('AIza-teste');
    expect(calls[0]?.url).not.toContain('AIza-teste');
    expect(calls[0]?.url).not.toContain('key=');
  });

  it('respeita o teto de saída derivado do tamanho do lote', async () => {
    const { transport, calls } = transporte(() => ({ corpo: respostaOk([0]) }));
    await classificador(transport).classify(sentences(1), content());

    const config = calls[0]?.body['generationConfig'] as Record<string, unknown>;
    expect(config['maxOutputTokens']).toBe(deriveMaxOutputTokens(3));
  });

  it('divide em lotes de no máximo `maxSentencesPerCall`', async () => {
    const { transport, calls } = transporte((n) => ({
      corpo: respostaOk(n === 1 ? [0, 1, 2] : [0]),
    }));
    const resultado = await classificador(transport).classify(
      sentences(4),
      content(),
    );

    expect(calls).toHaveLength(2);
    expect(resultado.classifications).toHaveLength(4);
  });

  it('não chama nada quando não há sentença analisável', async () => {
    const { transport, calls } = transporte(() => ({ corpo: respostaOk([]) }));
    const resultado = await classificador(transport).classify([], content());

    expect(calls).toHaveLength(0);
    expect(resultado.usage).toBeNull();
  });
});

describe('GeminiClassifier — tradução da resposta', () => {
  it('traduz índice LOCAL do lote para o id de domínio', async () => {
    const { transport } = transporte(() => ({ corpo: respostaOk([0, 1]) }));
    const resultado = await classificador(transport).classify(
      sentences(2, 700),
      content(),
    );

    expect(resultado.classifications.map((c) => c.sentenceId)).toEqual([700, 701]);
  });

  it('descarta índice fora do lote — o modelo pode inventar número', async () => {
    const { transport } = transporte(() => ({ corpo: respostaOk([0, 99]) }));
    const resultado = await classificador(transport).classify(
      sentences(2),
      content(),
    );

    expect(resultado.classifications).toHaveLength(1);
  });

  it('descarta índice REPETIDO', async () => {
    // Aceitar repetição produzia mais classificações que sentenças — origem do
    // score acima de 100 medido numa revisão anterior.
    const { transport } = transporte(() => ({ corpo: respostaOk([0, 0, 1]) }));
    const resultado = await classificador(transport).classify(
      sentences(2),
      content(),
    );

    expect(resultado.classifications).toHaveLength(2);
  });

  it('soma o uso de todos os lotes', async () => {
    const { transport } = transporte((n) => ({
      corpo: respostaOk(n === 1 ? [0, 1, 2] : [0], {
        promptTokenCount: 10,
        candidatesTokenCount: 5,
      }),
    }));
    const resultado = await classificador(transport).classify(
      sentences(4),
      content(),
    );

    expect(resultado.usage?.inputTokens).toBe(20);
    expect(resultado.usage?.outputTokens).toBe(10);
  });
});

describe('GeminiClassifier — cota esgotada', () => {
  /*
   * O caso que motivou o adapter existir. Em tier pago é evento raro; em free
   * tier é o modo de falha mais comum do dia, e NÃO pode virar
   * CLASSIFIER_FAILED — a mensagem daquele código manda tentar de novo, e
   * tentar de novo vai falhar igual.
   */
  it('HTTP 429 vira CLASSIFIER_QUOTA_EXHAUSTED', async () => {
    const { transport } = transporte(() => ({
      status: 429,
      corpo: { error: { code: 429, status: 'RESOURCE_EXHAUSTED' } },
    }));

    await expect(
      classificador(transport).classify(sentences(1), content()),
    ).rejects.toMatchObject({ code: 'CLASSIFIER_QUOTA_EXHAUSTED' });
  });

  it('RESOURCE_EXHAUSTED sem 429 também é cota, não falha genérica', async () => {
    const { transport } = transporte(() => ({
      status: 400,
      corpo: { error: { status: 'RESOURCE_EXHAUSTED' } },
    }));

    await expect(
      classificador(transport).classify(sentences(1), content()),
    ).rejects.toMatchObject({ code: 'CLASSIFIER_QUOTA_EXHAUSTED' });
  });

  it('modelo aposentado (404) vira CLASSIFIER_UNAVAILABLE', async () => {
    /*
     * MEDIDO, nao hipotetico: o Gemini aposentou `gemini-2.0-flash` durante o
     * desenvolvimento. Sem este caminho, o 404 virava CLASSIFIER_FAILED, cuja
     * mensagem manda tentar de novo — e tentar de novo nunca resolveria,
     * porque o remedio e' trocar a configuracao. Todo visitante veria "tente
     * novamente" indefinidamente enquanto o servico estivesse parado.
     */
    const { transport } = transporte(() => ({
      status: 404,
      corpo: {
        error: {
          code: 404,
          status: 'NOT_FOUND',
          message: 'This model models/gemini-2.0-flash is no longer available.',
        },
      },
    }));

    await expect(
      classificador(transport).classify(sentences(1), content()),
    ).rejects.toMatchObject({ code: 'CLASSIFIER_UNAVAILABLE' });
  });

  it('chave sem permissao (403) tem o mesmo remedio, logo o mesmo codigo', async () => {
    const { transport } = transporte(() => ({
      status: 403,
      corpo: { error: { status: 'PERMISSION_DENIED' } },
    }));

    await expect(
      classificador(transport).classify(sentences(1), content()),
    ).rejects.toMatchObject({ code: 'CLASSIFIER_UNAVAILABLE' });
  });

  it('outro erro HTTP continua sendo CLASSIFIER_FAILED', async () => {
    const { transport } = transporte(() => ({
      status: 500,
      corpo: { error: { status: 'INTERNAL' } },
    }));

    await expect(
      classificador(transport).classify(sentences(1), content()),
    ).rejects.toMatchObject({ code: 'CLASSIFIER_FAILED' });
  });
});

describe('GeminiClassifier — recusa e resposta ruim', () => {
  it('finishReason de segurança vira CLASSIFIER_REFUSED', async () => {
    const { transport } = transporte(() => ({
      corpo: { candidates: [{ finishReason: 'SAFETY' }], usageMetadata: {} },
    }));

    await expect(
      classificador(transport).classify(sentences(1), content()),
    ).rejects.toMatchObject({ code: 'CLASSIFIER_REFUSED' });
  });

  it('promptFeedback.blockReason vira CLASSIFIER_REFUSED', async () => {
    const { transport } = transporte(() => ({
      corpo: { promptFeedback: { blockReason: 'SAFETY' }, usageMetadata: {} },
    }));

    await expect(
      classificador(transport).classify(sentences(1), content()),
    ).rejects.toMatchObject({ code: 'CLASSIFIER_REFUSED' });
  });

  it('MAX_TOKENS vira INVALID_OUTPUT com a CAUSA certa', async () => {
    /*
     * A saída veio TRUNCADA por um teto que NÓS definimos.
     *
     * Asserção sobre a CAUSA, e não só sobre o código, porque uma sabotagem
     * mostrou que sem a checagem o JSON truncado cai no parse e produz o MESMO
     * código — só que culpando o formato da resposta por um limite nosso. A
     * versão anterior deste teste passava com a checagem removida, ou seja,
     * não verificava nada do que a checagem existe para dar.
     */
    const { transport } = transporte(() => ({
      corpo: {
        candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{"it' }] } }],
        usageMetadata: {},
      },
    }));

    const erro = await classificador(transport)
      .classify(sentences(1), content())
      .catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(AnalysisError);
    expect((erro as AnalysisError).code).toBe('CLASSIFIER_INVALID_OUTPUT');
    expect(String((erro as AnalysisError).cause)).toContain('maxOutputTokens');
  });

  it('JSON que não bate com o schema vira INVALID_OUTPUT', async () => {
    const { transport } = transporte(() => ({
      corpo: {
        candidates: [
          {
            finishReason: 'STOP',
            content: { parts: [{ text: '{"items":[{"id":"nao-e-numero"}]}' }] },
          },
        ],
        usageMetadata: {},
      },
    }));

    await expect(
      classificador(transport).classify(sentences(1), content()),
    ).rejects.toMatchObject({ code: 'CLASSIFIER_INVALID_OUTPUT' });
  });
});

describe('GeminiClassifier — liquidação da reserva (ADR-009)', () => {
  /*
   * Os lotes ANTERIORES já foram pagos. Sem levar esse uso junto do erro, a
   * reserva de orçamento seria devolvida integral sobre consumo real — que foi
   * exatamente o vazamento corrigido pela ADR-009 no irmão.
   */
  it('erro no segundo lote carrega o uso do PRIMEIRO', async () => {
    const { transport } = transporte((n) =>
      n === 1
        ? { corpo: respostaOk([0, 1, 2], { promptTokenCount: 77, candidatesTokenCount: 33 }) }
        : { status: 500, corpo: { error: { status: 'INTERNAL' } } },
    );

    const erro = await classificador(transport)
      .classify(sentences(4), content())
      .catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(AnalysisError);
    const partial = (erro as AnalysisError).partialUsage;
    expect(partial?.inputTokens).toBe(77);
    expect(partial?.outputTokens).toBe(33);
  });

  it('o lote RECUSADO também conta — ele foi cobrado', async () => {
    // Somar o uso depois da checagem de recusa fazia o lote recusado ficar
    // fora do `partialUsage`, e a liquidação devolvia reserva sobre consumo
    // real. Como a recusa é provocável por quem envia o conteúdo, cada
    // tentativa gastaria sem aparecer no contador.
    const { transport } = transporte(() => ({
      corpo: {
        candidates: [{ finishReason: 'SAFETY' }],
        usageMetadata: { promptTokenCount: 42, candidatesTokenCount: 0 },
      },
    }));

    const erro = await classificador(transport)
      .classify(sentences(1), content())
      .catch((e: unknown) => e);

    expect((erro as AnalysisError).partialUsage?.inputTokens).toBe(42);
  });

  it('falha no PRIMEIRO lote não inventa uso', async () => {
    // `null` e zero são coisas diferentes para a liquidação: só `null` devolve
    // a reserva integral.
    const { transport } = transporte(() => ({
      status: 500,
      corpo: { error: { status: 'INTERNAL' } },
    }));

    const erro = await classificador(transport)
      .classify(sentences(1), content())
      .catch((e: unknown) => e);

    expect((erro as AnalysisError).partialUsage).toBeNull();
  });
});

describe('GeminiClassifier — contagem de tokens', () => {
  it('o systemInstruction VAI na contagem', async () => {
    /*
     * MEDIDO contra a API real: `countTokens` recusa `systemInstruction` no
     * topo com 400, e exige o envelope `generateContentRequest`.
     *
     * Nao e' detalhe de forma. A rubrica do sistema tem ~800 tokens e e' a
     * maior parte da entrada; conta-la de fora subestimaria o custo, e a
     * guarda de orcamento — que decide a partir desta contagem — cobraria a
     * menos em TODA analise. Erro de contabilidade silencioso.
     */
    const { transport, calls } = transporte(() => ({ corpo: { totalTokens: 1 } }));
    await classificador(transport).estimateInputTokens(sentences(1), content());

    const envelope = calls[0]?.body['generateContentRequest'] as
      | Record<string, unknown>
      | undefined;
    expect(envelope, 'countTokens precisa do envelope').toBeDefined();
    expect(envelope?.['systemInstruction']).toBeDefined();
    expect(envelope?.['model']).toBe('models/gemini-2.5-flash');
    // E o campo NAO pode estar no topo, que e' o que a API recusa.
    expect(calls[0]?.body['systemInstruction']).toBeUndefined();
  });

  it('soma `totalTokens` de cada lote', async () => {
    const { transport, calls } = transporte(() => ({
      corpo: { totalTokens: 300 },
    }));

    const total = await classificador(transport).estimateInputTokens(
      sentences(4),
      content(),
    );

    expect(calls).toHaveLength(2);
    expect(calls[0]?.url).toContain(':countTokens');
    expect(total).toBe(600);
  });

  it('não chama nada quando não há sentença analisável', async () => {
    const { transport, calls } = transporte(() => ({ corpo: { totalTokens: 1 } }));
    const total = await classificador(transport).estimateInputTokens([], content());

    expect(calls).toHaveLength(0);
    expect(total).toBe(0);
  });

  it('cota esgotada na contagem também é reportada como cota', async () => {
    // O pré-flight acontece ANTES da classificação. Se ele reportasse falha
    // genérica, o usuário veria "tente novamente" sem nunca ter chegado a
    // gastar nada.
    const { transport } = transporte(() => ({
      status: 429,
      corpo: { error: { status: 'RESOURCE_EXHAUSTED' } },
    }));

    await expect(
      classificador(transport).estimateInputTokens(sentences(1), content()),
    ).rejects.toMatchObject({ code: 'CLASSIFIER_QUOTA_EXHAUSTED' });
  });
});
