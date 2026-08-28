import { describe, expect, it } from 'vitest';

import { HybridClassifier } from '../../../src/adapters/classify/hybrid-classifier.js';
import { AnalysisError } from '../../../src/core/domain/errors.js';
import type { Classification } from '../../../src/core/domain/classification.js';
import type { ExtractedContent } from '../../../src/core/domain/extracted-content.js';
import type { Sentence } from '../../../src/core/domain/sentence.js';
import type {
  ClaimClassifier,
  ClassificationResult,
} from '../../../src/core/ports/claim-classifier.js';

function content(): ExtractedContent {
  return {
    url: 'https://exemplo.test/a',
    title: null,
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

let nextId = 0;
function sentence(text: string, analyzable = true): Sentence {
  const id = nextId++;
  return analyzable
    ? { id, text, start: 0, end: text.length, analyzable: true }
    : {
        id,
        text,
        start: 0,
        end: text.length,
        analyzable: false,
        excludedReason: 'heading',
      };
}

/** LLM falso que registra o que recebeu. Nenhuma rede, nenhum gasto. */
class SpyLlm implements ClaimClassifier {
  received: Sentence[][] = [];
  constructor(private readonly category: Classification['category'] = 'UNSOURCED') {}

  async classify(sentences: readonly Sentence[]): Promise<ClassificationResult> {
    this.received.push([...sentences]);
    return {
      classifications: sentences.map((s) => ({
        sentenceId: s.id,
        category: this.category,
        confidence: 0.75,
        decidedBy: 'llm' as const,
        signals: [],
      })),
      usage: {
        inputTokens: 10,
        outputTokens: 5,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
      },
    };
  }
}

describe('HybridClassifier — composição', () => {
  it('resolve por regra o que é óbvio e escala só o resto', async () => {
    const llm = new SpyLlm();
    const hybrid = new HybridClassifier(llm);

    const lista = [
      // decidida por regra: atribuição nomeada + percentual
      sentence('Segundo o IBGE, a inflação fechou 2024 em 4,8%.'),
      // decidida por regra: primeira pessoa avaliativa
      sentence('Na minha opinião, essa é a melhor abordagem disponível.'),
      // escala: falsa autoridade
      sentence('Estudos mostram que a maioria das empresas adotou a prática.'),
      // escala: afirmação factual sem fonte
      sentence('A adoção de inteligência artificial cresceu no setor jurídico.'),
    ];

    const result = await hybrid.classify(lista, content());

    expect(result.classifications).toHaveLength(4);
    // Só as duas ambíguas foram ao LLM.
    expect(llm.received).toHaveLength(1);
    expect(llm.received[0]).toHaveLength(2);

    const porRegra = result.classifications.filter((c) => c.decidedBy === 'rules');
    const porLlm = result.classifications.filter((c) => c.decidedBy === 'llm');
    expect(porRegra).toHaveLength(2);
    expect(porLlm).toHaveLength(2);
  });

  it('ignora sentenças não analisáveis', async () => {
    const llm = new SpyLlm();
    const hybrid = new HybridClassifier(llm);
    const result = await hybrid.classify(
      [
        sentence('O que é densidade factual', false),
        sentence('A adoção de IA cresceu no setor jurídico brasileiro.'),
      ],
      content(),
    );
    expect(result.classifications).toHaveLength(1);
  });

  it('NÃO chama o LLM quando o pré-filtro resolve tudo', async () => {
    // Melhor caso do desenho híbrido: custo zero.
    const llm = new SpyLlm();
    const hybrid = new HybridClassifier(llm);
    const result = await hybrid.classify(
      [
        sentence('Segundo o IBGE, a inflação fechou 2024 em 4,8%.'),
        sentence('Na minha opinião, essa é a melhor abordagem disponível.'),
      ],
      content(),
    );
    expect(llm.received).toHaveLength(0);
    expect(result.usage).toBeNull();
    expect(result.classifications).toHaveLength(2);
  });

  it('propaga o usage do LLM', async () => {
    const hybrid = new HybridClassifier(new SpyLlm());
    const result = await hybrid.classify(
      [sentence('A adoção de IA cresceu no setor jurídico brasileiro.')],
      content(),
    );
    expect(result.usage?.inputTokens).toBe(10);
  });
});

describe('HybridClassifier — invariante de ADR-002', () => {
  it('nenhuma sentença recebe UNSOURCED por regra', async () => {
    const corpus = [
      'A adoção de IA cresceu muito no setor jurídico brasileiro.',
      'Estudos mostram que a maioria das empresas já adotou a prática.',
      'O mercado movimentou 42 milhões no período analisado.',
      'Segundo o IBGE, a inflação fechou 2024 em 4,8%.',
      'Na minha opinião, essa é a melhor abordagem para o problema.',
      'Você deve revisar suas meta tags antes de publicar.',
      'Talvez o cenário mude nos próximos meses conforme o mercado reage.',
      'No Segundo Trimestre de 2024, a empresa cresceu bastante.',
      'De acordo com a Serasa, 72 milhões de brasileiros estão inadimplentes.',
    ].map((text) => sentence(text));

    const hybrid = new HybridClassifier(new SpyLlm('UNSOURCED'));
    const result = await hybrid.classify(corpus, content());

    for (const classification of result.classifications) {
      if (classification.category === 'UNSOURCED') {
        expect(classification.decidedBy).toBe('llm');
      }
    }
  });
});

describe('HybridClassifier — rede de segurança', () => {
  it('falha quando o LLM omite uma sentença escalada', async () => {
    // Sentença escalada e não devolvida ficaria fora de N e distorceria o
    // score em silêncio. Falhar é melhor que entregar score parcial como
    // se fosse completo.
    class LlmQueOmite implements ClaimClassifier {
      async classify(sentences: readonly Sentence[]): Promise<ClassificationResult> {
        const primeira = sentences[0];
        return {
          classifications:
            primeira === undefined
              ? []
              : [
                  {
                    sentenceId: primeira.id,
                    category: 'UNSOURCED',
                    confidence: 0.8,
                    decidedBy: 'llm',
                    signals: [],
                  },
                ],
          usage: null,
        };
      }
    }

    const hybrid = new HybridClassifier(new LlmQueOmite());
    const lista = [
      sentence('A adoção de IA cresceu no setor jurídico brasileiro.'),
      sentence('Estudos mostram que a prática já é comum entre as empresas.'),
    ];

    await expect(hybrid.classify(lista, content())).rejects.toBeInstanceOf(
      AnalysisError,
    );
  });

  it('propaga a falha do LLM — classificação é fatal por definição', async () => {
    class LlmQueFalha implements ClaimClassifier {
      async classify(): Promise<ClassificationResult> {
        throw new AnalysisError('CLASSIFIER_FAILED', 'boom');
      }
    }
    const hybrid = new HybridClassifier(new LlmQueFalha());
    await expect(
      hybrid.classify(
        [sentence('A adoção de IA cresceu no setor jurídico brasileiro.')],
        content(),
      ),
    ).rejects.toBeInstanceOf(AnalysisError);
  });
});

describe('HybridClassifier — escalationRate', () => {
  it('mede a taxa sem gastar nada', async () => {
    const llm = new SpyLlm();
    const hybrid = new HybridClassifier(llm);
    const lista = [
      sentence('Segundo o IBGE, a inflação fechou 2024 em 4,8%.'),
      sentence('Na minha opinião, essa é a melhor abordagem disponível.'),
      sentence('A adoção de IA cresceu no setor jurídico brasileiro.'),
      sentence('Estudos mostram que a prática já é comum entre empresas.'),
    ];

    const medida = hybrid.escalationRate(lista, content());
    expect(medida.analyzable).toBe(4);
    expect(medida.escalated).toBe(2);
    expect(medida.rate).toBe(0.5);
    // O ponto: nenhuma chamada de LLM aconteceu para medir isso.
    expect(llm.received).toHaveLength(0);
  });

  it('não divide por zero sem sentenças analisáveis', () => {
    const hybrid = new HybridClassifier(new SpyLlm());
    const medida = hybrid.escalationRate([sentence('Título', false)], content());
    expect(medida.rate).toBe(0);
    expect(Number.isNaN(medida.rate)).toBe(false);
  });
});
