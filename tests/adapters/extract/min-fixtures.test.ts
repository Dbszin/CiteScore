import { describe, expect, it } from 'vitest';

import { DOM_PARSERS } from '../../../src/adapters/extract/dom-parser.js';
import { ReadabilityExtractor } from '../../../src/adapters/extract/readability-extractor.js';
import { IntlSentenceSegmenter } from '../../../src/adapters/segment/intl-sentence-segmenter.js';
import { assessIndexPage } from '../../../src/core/domain/index-page-guard.js';
import { loadMinFixture } from '../../helpers/fixtures.js';

/**
 * Cobertura que roda em QUALQUER clone.
 *
 * Os fixtures reais (4 MB) estão no `.gitignore`, e a suíte reportava verde
 * mesmo quando os 16 testes que dependiam deles viravam `skipped` — ou seja,
 * "151/151 passando" era verdade só na máquina de quem tinha baixado os
 * HTMLs. Estes fixtures mínimos (poucos KB, versionados) garantem que as
 * propriedades essenciais continuem verificadas em CI.
 */
const segmenter = new IntlSentenceSegmenter();

async function analisar(nome: string, parser: 'jsdom' | 'linkedom' = 'linkedom') {
  const extractor = new ReadabilityExtractor(DOM_PARSERS[parser]);
  const content = await extractor.extract(loadMinFixture(nome));
  const sentences = segmenter.segment(content);
  return { content, sentences, assessment: assessIndexPage(sentences) };
}

describe('Fixtures mínimos — artigo', () => {
  it('extrai o conteúdo e detecta PT-BR', async () => {
    const { content } = await analisar('pt-artigo.html');
    expect(content.language).toBe('pt-BR');
    expect(content.wordCount).toBeGreaterThan(150);
  });

  it('NÃO gruda sentenças de parágrafos vizinhos', async () => {
    const { content } = await analisar('pt-artigo.html');
    // O defeito do `article.textContent`: fim de frase colado no início da
    // próxima, sem espaço. Um ponto seguido direto de letra maiúscula.
    expect(content.text).not.toMatch(/[a-záéíóúâêôãõç]\.[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/u);
  });

  it('caracteres por palavra ficam na faixa de prosa', async () => {
    const { content } = await analisar('pt-artigo.html');
    expect(content.shape.charsPerWord).toBeGreaterThan(3);
    expect(content.shape.charsPerWord).toBeLessThan(9);
  });

  it('NÃO é classificado como página-índice', async () => {
    const { assessment } = await analisar('pt-artigo.html');
    expect(assessment.isIndexPage).toBe(false);
    expect(assessment.analyzableRatio).toBeGreaterThan(0.35);
  });

  it('headings não entram na contagem de analisáveis', async () => {
    const { sentences } = await analisar('pt-artigo.html');
    const headings = sentences.filter((s) => s.excludedReason === 'heading');
    expect(headings.length).toBeGreaterThan(0);
    for (const heading of headings) {
      expect(heading.analyzable).toBe(false);
    }
  });

  it('offsets apontam para o texto correto', async () => {
    const { content, sentences } = await analisar('pt-artigo.html');
    for (const sentence of sentences) {
      expect(content.text.slice(sentence.start, sentence.end)).toBe(
        sentence.text,
      );
    }
  });
});

describe('Fixtures mínimos — página-índice', () => {
  it('home de portal É detectada como página-índice', async () => {
    // 25 manchetes sem pontuação terminal: passaria a extração e produziria
    // um score sem sentido se a guarda não existisse.
    const { assessment } = await analisar('pt-indice.html');
    expect(assessment.isIndexPage).toBe(true);
    expect(assessment.analyzableRatio).toBeLessThan(0.35);
  });
});

describe('Fixtures mínimos — paridade entre parsers', () => {
  for (const nome of ['pt-artigo.html', 'pt-indice.html']) {
    it(`${nome}: jsdom e linkedom concordam`, async () => {
      const comJsdom = await analisar(nome, 'jsdom');
      const comLinkedom = await analisar(nome, 'linkedom');

      const base = comJsdom.content.wordCount;
      const diff = Math.abs(comLinkedom.content.wordCount - base) / base;
      expect(diff).toBeLessThan(0.05);
      expect(comLinkedom.assessment.isIndexPage).toBe(
        comJsdom.assessment.isIndexPage,
      );
    });
  }
});
