import { describe, expect, it } from 'vitest';

import { IntlSentenceSegmenter } from '../../../src/adapters/segment/intl-sentence-segmenter.js';
import type { ExtractedContent } from '../../../src/core/domain/extracted-content.js';

const segmenter = new IntlSentenceSegmenter();

function content(
  text: string,
  language: 'pt-BR' | 'en' = 'pt-BR',
): ExtractedContent {
  const words = text.split(/\s+/u).filter(Boolean).length;
  return {
    url: 'https://exemplo.test/a',
    title: null,
    text,
    language,
    wordCount: words,
    shape: {
      readerable: true,
      linkCount: 0,
      headingCount: 0,
      charsPerWord: words === 0 ? 0 : text.length / words,
      linksPerWord: 0,
    },
  };
}

function analyzableTexts(text: string, language: 'pt-BR' | 'en' = 'pt-BR') {
  return segmenter
    .segment(content(text, language))
    .filter((s) => s.analyzable)
    .map((s) => s.text);
}

describe('IntlSentenceSegmenter — casos de quebra difícil em PT-BR', () => {
  it('não quebra em abreviação com ponto', () => {
    const result = analyzableTexts(
      'O Dr. Silva apresentou os dados na conferência anual de cardiologia.',
    );
    expect(result).toHaveLength(1);
  });

  it('não quebra em decimal', () => {
    const result = analyzableTexts(
      'A taxa registrada foi de 3,14 pontos percentuais no trimestre passado.',
    );
    expect(result).toHaveLength(1);
  });

  it('não quebra em "etc." no meio da oração', () => {
    const result = analyzableTexts(
      'Foram avaliados links, títulos, descrições etc. antes da publicação final.',
    );
    expect(result).toHaveLength(1);
  });

  it('separa duas sentenças reais no mesmo bloco', () => {
    const result = analyzableTexts(
      'A inflação fechou o ano em queda acentuada. O consumo das famílias reagiu rápido.',
    );
    expect(result).toHaveLength(2);
  });

  it('não trata reticências como fim de duas sentenças', () => {
    const result = segmenter.segment(
      content('O resultado ainda não está claro… mas a tendência segue positiva.'),
    );
    expect(result.length).toBeLessThanOrEqual(2);
  });
});

describe('IntlSentenceSegmenter — sentença não analisável', () => {
  it('marca heading como não analisável com o motivo', () => {
    const sentences = segmenter.segment(
      content('O que é densidade factual\nA densidade factual mede a proporção de afirmações sustentadas.'),
    );
    const heading = sentences.find((s) => s.text === 'O que é densidade factual');
    expect(heading?.analyzable).toBe(false);
    expect(heading?.excludedReason).toBe('heading');
  });

  it('marca item de lista curto como não analisável', () => {
    const sentences = segmenter.segment(content('• Preço baixo\n• Entrega rápida'));
    for (const sentence of sentences) {
      expect(sentence.analyzable).toBe(false);
    }
  });

  it('marca sentença muito curta como short', () => {
    const sentences = segmenter.segment(content('Sim.'));
    expect(sentences[0]?.analyzable).toBe(false);
    expect(sentences[0]?.excludedReason).toBe('short');
  });

  it('manchete de home sem pontuação terminal não é analisável', () => {
    // É exatamente do que a home da Folha é feita.
    const sentences = segmenter.segment(
      content('Três Poderes se aproximam em pacto de conveniências mútuas'),
    );
    expect(sentences[0]?.analyzable).toBe(false);
    expect(sentences[0]?.excludedReason).toBe('heading');
  });

  it('prosa longa NÃO é excluída por falta de sinal de verbo', () => {
    // A heurística de no_verb é conservadora de propósito: falso positivo
    // aqui excluiria sentença legítima da análise, que é o erro mais caro.
    const result = analyzableTexts(
      'A combinação de dados abertos com metodologia transparente em veículos regionais brasileiros de grande alcance.',
    );
    expect(result).toHaveLength(1);
  });
});

describe('IntlSentenceSegmenter — offsets', () => {
  it('offsets apontam para o texto correto no conteúdo original', () => {
    const text =
      'A inflação fechou o ano em queda acentuada. O consumo reagiu de forma rápida.';
    const sentences = segmenter.segment(content(text));
    for (const sentence of sentences) {
      expect(text.slice(sentence.start, sentence.end)).toBe(sentence.text);
    }
  });

  it('offsets seguem corretos com múltiplos blocos', () => {
    const text = 'Primeiro bloco com uma frase completa aqui.\nSegundo bloco com outra frase inteira.';
    const sentences = segmenter.segment(content(text));
    expect(sentences.length).toBeGreaterThanOrEqual(2);
    for (const sentence of sentences) {
      expect(text.slice(sentence.start, sentence.end)).toBe(sentence.text);
    }
  });
});

describe('IntlSentenceSegmenter — inglês', () => {
  it('segmenta prosa em inglês', () => {
    const result = analyzableTexts(
      'Meta tags are snippets of code. They tell search engines about your page.',
      'en',
    );
    expect(result).toHaveLength(2);
  });
});
