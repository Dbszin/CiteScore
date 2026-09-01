import { describe, expect, it } from 'vitest';

import type { Analysis } from '../../src/core/domain/analysis.js';
import { buildCoverageNotice } from '../../src/components/report-model.js';

/**
 * O aviso de cobertura parcial.
 *
 * Fecha um vão de HONESTIDADE que ficou aberto: uma landing page escorrega pela
 * guarda de página-índice, é medida em 40% dos blocos, e nada na tela dizia
 * isso. O número saía plausível e descrevia meia página.
 *
 * É o mesmo modo de falha que motivou a guarda — "lixo plausível, não erro, que
 * é pior porque passa" — num degrau em que a guarda não pega.
 */

function analise(total: number, analisaveis: number): Analysis {
  return {
    url: 'https://exemplo.test/a',
    title: 'Artigo',
    language: 'pt-BR',
    scoreVersion: '1.0.0',
    outcome: { kind: 'scored', score: 40 },
    breakdown: {
      analyzableSentences: analisaveis,
      sourced: 1,
      unsourced: 1,
      opinion: 0,
      factualDensity: 0.5,
      gapRate: 0.5,
      llmEscalationRate: 1,
    },
    sentences: Array.from({ length: total }, (_, id) => ({
      id,
      text: 'frase',
      start: 0,
      end: 5,
      analyzable: id < analisaveis,
    })),
    classifications: [],
    suggestions: [],
    suggestionsDegraded: false,
    truncated: false,
    methodology: {
      kind: 'heuristic_proxy',
      measuredCitations: false,
      disclaimer: 'ressalva',
      methodologyUrl: '/#metodo',
    },
    durationMs: 1,
  };
}

describe('buildCoverageNotice — quando NÃO avisa', () => {
  /*
   * Os três artigos do corpus, com as razões medidas. Avisar neles seria
   * gritar lobo: eles foram medidos na maior parte da página.
   */
  it.each([
    ['MDN, doc técnico', 120, 82],
    ['Moz, pilar SEO', 175, 100],
    ['Ahrefs, blog SEO', 255, 149],
  ])('%s não gera aviso', (_rotulo, total, analisaveis) => {
    expect(buildCoverageNotice(analise(total, analisaveis))).toBeNull();
  });

  it('página medida por inteiro não gera aviso', () => {
    expect(buildCoverageNotice(analise(50, 50))).toBeNull();
  });

  it('exatamente no limiar não gera aviso', () => {
    // O limiar é inclusivo: 50% ainda é "medimos metade", e a linha tinha que
    // cair para um dos lados.
    expect(buildCoverageNotice(analise(100, 50))).toBeNull();
  });

  it('texto sem sentença nenhuma não gera aviso', () => {
    // Aqui não há o que qualificar, e dividir por zero seria pior.
    expect(buildCoverageNotice(analise(0, 0))).toBeNull();
  });
});

describe('buildCoverageNotice — quando AVISA', () => {
  /*
   * As landing pages que escorregam pela guarda, com as razões medidas em
   * `scripts/medir-landing-pages.ts`.
   */
  it.each([
    ['Resend', 80, 37],
    ['Stripe', 94, 38],
    ['RD Station', 63, 25],
    ['Wikipedia, lista de PIB', 100, 43],
  ])('%s gera aviso', (_rotulo, total, analisaveis) => {
    expect(buildCoverageNotice(analise(total, analisaveis))).not.toBeNull();
  });

  it('o aviso traz os NÚMEROS, para dar para conferir', () => {
    const aviso = buildCoverageNotice(analise(94, 38)) ?? '';
    expect(aviso).toContain('38');
    expect(aviso).toContain('94');
    expect(aviso).toContain('40%');
  });

  it('o aviso diz que a proporção NÃO descreve a página inteira', () => {
    // É a frase que impede a leitura errada. Sem ela o aviso informaria um
    // fato sem dizer a consequência dele.
    const aviso = buildCoverageNotice(analise(94, 38)) ?? '';
    expect(aviso).toMatch(/não a página inteira/u);
  });

  it('o aviso explica O QUE ficou de fora', () => {
    // Sem isso o leitor conclui que o sistema falhou, quando ele descartou
    // título e fragmento de propósito.
    const aviso = buildCoverageNotice(analise(94, 38)) ?? '';
    expect(aviso).toMatch(/título/u);
    expect(aviso).toMatch(/lista|fragmento/u);
  });
});
