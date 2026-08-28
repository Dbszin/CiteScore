import { describe, expect, it } from 'vitest';

import { DOM_PARSERS } from '../../../src/adapters/extract/dom-parser.js';
import { ReadabilityExtractor } from '../../../src/adapters/extract/readability-extractor.js';
import { IntlSentenceSegmenter } from '../../../src/adapters/segment/intl-sentence-segmenter.js';
import { isAnalysisError } from '../../../src/core/domain/errors.js';
import { assessIndexPage } from '../../../src/core/domain/index-page-guard.js';
import {
  fixturesAvailable,
  loadFixtureById,
} from '../../helpers/fixtures.js';

const available = fixturesAvailable();
const suite = available ? describe : describe.skip;

const segmenter = new IntlSentenceSegmenter();

async function analyze(id: string, parser: 'jsdom' | 'linkedom' = 'linkedom') {
  const page = loadFixtureById(id);
  if (page === null) return null;
  const extractor = new ReadabilityExtractor(DOM_PARSERS[parser]);
  const content = await extractor.extract(page);
  const sentences = segmenter.segment(content);
  return { content, sentences, assessment: assessIndexPage(sentences) };
}

suite('Extração sobre fixtures reais', () => {
  describe('CORREÇÃO 1 — texto não vem grudado', () => {
    it('Ahrefs: a sentença que o benchmark grudou agora está separada', async () => {
      const result = await analyze('en-seo-ahrefs');
      expect(result).not.toBeNull();
      // O defeito medido com article.textContent era "visitors.Every".
      expect(result?.content.text).not.toContain('visitors.Every');
    });

    it('nenhum fixture produz caracteres-por-palavra anômalo', async () => {
      // Com textContent, a home da Folha dava 28,4 char/palavra —
      // sintoma de boilerplate e texto grudado. Prosa fica em 5–8.
      for (const id of ['en-seo-ahrefs', 'en-seo-moz', 'en-tech-mdn', 'pt-jornal-folha']) {
        const result = await analyze(id);
        if (result === null) continue;
        expect(result.content.shape.charsPerWord).toBeLessThan(9);
        expect(result.content.shape.charsPerWord).toBeGreaterThan(3);
      }
    });

    it('não há sentença suspeitamente longa por falta de separador', async () => {
      const result = await analyze('en-spa-vercel');
      const longest = Math.max(
        ...(result?.sentences.map((s) => s.text.length) ?? [0]),
      );
      // Sem separador de bloco, o blog do Next.js virava um bloco gigante.
      expect(longest).toBeLessThan(1_500);
    });
  });

  describe('CORREÇÃO 2 — guarda de página-índice', () => {
    it('home do G1 é barrada já na extração', async () => {
      const page = loadFixtureById('pt-jornal-g1');
      expect(page).not.toBeNull();
      if (page === null) return;

      const extractor = new ReadabilityExtractor(DOM_PARSERS.linkedom);
      await expect(extractor.extract(page)).rejects.toSatisfy(
        (error: unknown) =>
          isAnalysisError(error) && error.code === 'NO_MAIN_CONTENT',
      );
    });

    it('home da Folha é detectada como página-índice', async () => {
      const result = await analyze('pt-jornal-folha');
      expect(result?.assessment.isIndexPage).toBe(true);
      // 331 palavras de manchetes: passaria a extração e daria score sem sentido.
      expect(result?.assessment.analyzableRatio).toBeLessThan(0.2);
    });

    it('índice de blog do Next.js é detectado como página-índice', async () => {
      const result = await analyze('en-spa-vercel');
      expect(result?.assessment.isIndexPage).toBe(true);
    });

    it('artigos reais NÃO são flagrados', async () => {
      for (const id of ['en-seo-ahrefs', 'en-seo-moz', 'en-tech-mdn']) {
        const result = await analyze(id);
        expect(result?.assessment.isIndexPage, id).toBe(false);
        expect(result?.assessment.analyzableRatio, id).toBeGreaterThan(0.5);
      }
    });

    it('lista da Wikipedia NÃO é flagrada, apesar da densidade de links', async () => {
      // Achado da medição: a Wikipedia tem a MAIOR densidade de links do
      // corpus (0,316 — quase o dobro da home da Folha). Se o critério fosse
      // links por palavra, o conteúdo mais denso em fonte seria o falso
      // positivo. Por isso o sinal foi descartado.
      const result = await analyze('en-list-wikipedia');
      expect(result?.assessment.isIndexPage).toBe(false);
      expect(result?.content.shape.linksPerWord).toBeGreaterThan(0.2);
    });
  });

  describe('detecção de idioma', () => {
    it('identifica PT-BR e EN corretamente', async () => {
      expect((await analyze('pt-jornal-folha'))?.content.language).toBe('pt-BR');
      expect((await analyze('en-seo-moz'))?.content.language).toBe('en');
      expect((await analyze('en-tech-mdn'))?.content.language).toBe('en');
    });
  });

  describe('CORREÇÃO 4 — linkedom reproduz jsdom?', () => {
    const ids = [
      'en-seo-ahrefs',
      'en-seo-moz',
      'en-tech-mdn',
      'pt-jornal-folha',
      'en-spa-vercel',
      'en-list-wikipedia',
    ];

    for (const id of ids) {
      it(`${id}: contagem de palavras equivalente entre os dois parsers`, async () => {
        const comJsdom = await analyze(id, 'jsdom');
        const comLinkedom = await analyze(id, 'linkedom');
        expect(comJsdom).not.toBeNull();
        expect(comLinkedom).not.toBeNull();
        if (comJsdom === null || comLinkedom === null) return;

        const base = comJsdom.content.wordCount;
        const diff = Math.abs(comLinkedom.content.wordCount - base) / base;
        // Medido: 6/7 idênticos, MDN com 1,2% de variância.
        expect(diff).toBeLessThan(0.05);
      });
    }

    it('os dois parsers concordam sobre o que é página-índice', async () => {
      for (const id of ids) {
        const comJsdom = await analyze(id, 'jsdom');
        const comLinkedom = await analyze(id, 'linkedom');
        expect(comLinkedom?.assessment.isIndexPage, id).toBe(
          comJsdom?.assessment.isIndexPage,
        );
      }
    });
  });
});

if (!available) {
  describe('Extração sobre fixtures reais', () => {
    it('fixtures ausentes — rode scripts/benchmarks/extraction/fetch.js', () => {
      expect(true).toBe(true);
    });
  });
}
