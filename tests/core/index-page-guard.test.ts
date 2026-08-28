import { describe, expect, it } from 'vitest';

import {
  MIN_ANALYZABLE_RATIO,
  MIN_SENTENCES_FOR_RATIO,
  assessIndexPage,
} from '../../src/core/domain/index-page-guard.js';
import type { Sentence } from '../../src/core/domain/sentence.js';

function sentences(analyzable: number, excluded: number): Sentence[] {
  const out: Sentence[] = [];
  let id = 0;
  for (let i = 0; i < analyzable; i += 1) {
    out.push({ id: id++, text: 'x', start: 0, end: 1, analyzable: true });
  }
  for (let i = 0; i < excluded; i += 1) {
    out.push({
      id: id++,
      text: 'x',
      start: 0,
      end: 1,
      analyzable: false,
      excludedReason: 'heading',
    });
  }
  return out;
}

describe('assessIndexPage — limiar calibrado nos fixtures reais', () => {
  /**
   * Razões medidas sobre os 7 fixtures:
   *   MDN 0.667 | Moz 0.554 | Ahrefs 0.545 | Wikipedia 0.431
   *   Next.js /blog 0.276 | Folha home 0.087
   * Limiar 0.35 separa com folga: 0.276 flagrado, 0.431 não.
   */
  it('reproduz a decisão para a home da Folha (7 de 80)', () => {
    const result = assessIndexPage(sentences(7, 73));
    expect(result.isIndexPage).toBe(true);
    expect(result.analyzableRatio).toBeCloseTo(0.0875, 3);
  });

  it('reproduz a decisão para o índice do blog do Next.js (60 de 217)', () => {
    const result = assessIndexPage(sentences(60, 157));
    expect(result.isIndexPage).toBe(true);
  });

  it('não flagra a lista da Wikipedia (53 de 123)', () => {
    const result = assessIndexPage(sentences(53, 70));
    expect(result.isIndexPage).toBe(false);
  });

  it('não flagra artigo real (139 de 255)', () => {
    const result = assessIndexPage(sentences(139, 116));
    expect(result.isIndexPage).toBe(false);
  });
});

describe('assessIndexPage — bordas', () => {
  it('não aplica a razão quando há poucas sentenças', () => {
    // Abaixo do piso a razão é instável; INSUFFICIENT_CONTENT cobre o caso.
    const result = assessIndexPage(sentences(1, MIN_SENTENCES_FOR_RATIO - 2));
    expect(result.totalSentences).toBeLessThan(MIN_SENTENCES_FOR_RATIO);
    expect(result.isIndexPage).toBe(false);
  });

  it('lista vazia não lança nem divide por zero', () => {
    const result = assessIndexPage([]);
    expect(result.analyzableRatio).toBe(0);
    expect(result.isIndexPage).toBe(false);
    expect(Number.isNaN(result.analyzableRatio)).toBe(false);
  });

  it('exatamente no limiar não é flagrado', () => {
    const total = 100;
    const analyzable = Math.ceil(MIN_ANALYZABLE_RATIO * total);
    const result = assessIndexPage(sentences(analyzable, total - analyzable));
    expect(result.isIndexPage).toBe(false);
  });

  it('um ponto abaixo do limiar é flagrado', () => {
    const total = 100;
    const analyzable = Math.floor(MIN_ANALYZABLE_RATIO * total) - 1;
    const result = assessIndexPage(sentences(analyzable, total - analyzable));
    expect(result.isIndexPage).toBe(true);
  });
});
