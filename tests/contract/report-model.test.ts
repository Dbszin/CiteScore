import { describe, expect, it } from 'vitest';
import type { Analysis } from '../../src/core/domain/analysis.js';
import { buildMethodology } from '../../src/core/domain/methodology.js';
import type { Sentence } from '../../src/core/domain/sentence.js';
import {
  buildLegend,
  buildRecord,
  buildScorePanel,
  buildSegments,
} from '../../src/components/report-model.js';
import { classifyAll, makeSentences } from '../helpers/stub-ports.js';

function makeAnalysis(overrides: Partial<Analysis> = {}): Analysis {
  const sentences = makeSentences(10);
  return {
    url: 'https://exemplo.com/artigo',
    title: 'Artigo',
    language: 'pt-BR',
    scoreVersion: '1.0.0',
    outcome: { kind: 'scored', score: 42 },
    breakdown: {
      analyzableSentences: 10,
      sourced: 3,
      unsourced: 5,
      opinion: 2,
      factualDensity: 0.3,
      gapRate: 0.625,
      llmEscalationRate: 1,
    },
    sentences,
    classifications: classifyAll(sentences),
    suggestions: [],
    suggestionsDegraded: false,
    truncated: false,
    methodology: buildMethodology('/metodologia'),
    durationMs: 1_000,
    ...overrides,
  };
}

/**
 * ADR-004 na apresentação.
 *
 * O invariante "score nunca sem breakdown" era garantido por dois
 * condicionais independentes no JSX. Agora é garantido pelo TIPO — e este
 * arquivo trava a regra, não a marcação, então sobrevive ao redesign do M3.
 */
describe('buildScorePanel — invariante da ADR-004', () => {
  it('o painel traz o breakdown como figura principal', () => {
    const panel = buildScorePanel(makeAnalysis());

    expect(panel.kind).toBe('scored');
    if (panel.kind !== 'scored') throw new Error('esperado scored');
    expect(panel.breakdown).toHaveLength(3);
    expect(panel.summary.length).toBeGreaterThan(10);
  });

  /**
   * O requisito central da emenda da ADR-007.
   *
   * A régua é comprimida (o artigo escolhido como modelo de bom conteúdo SEO
   * tira 13 de 100) e instável (uma em seis execuções diverge 8 pontos). Um
   * número nessas condições não pode ser a figura principal — e a garantia
   * é do TIPO: o painel não tem onde carregá-lo.
   */
  it('o composto de 0 a 100 NÃO está no painel', () => {
    const panel = buildScorePanel(makeAnalysis());

    expect(panel).not.toHaveProperty('score');
    expect(JSON.stringify(panel)).not.toContain('42');
  });

  it('o composto vive na ficha técnica, ao lado da versão e do modelo', () => {
    const record = buildRecord(makeAnalysis());
    const medicao = record.find((linha) => linha.key === 'medição');

    expect(medicao?.value).toContain('composto 42');
    expect(medicao?.value).toContain('score v1.0.0');
    // Diagnóstico entre diagnósticos, não resultado em destaque.
    expect(medicao?.value).toContain('densidade factual');
  });

  it('a ficha técnica de um resultado SEM medida omite a linha de medição', () => {
    const record = buildRecord(
      makeAnalysis({ outcome: { kind: 'unscored', reason: 'NO_CLAIMS_FOUND' } }),
    );

    expect(record.find((linha) => linha.key === 'medição')).toBeUndefined();
    expect(record.map((linha) => linha.key)).toEqual(['artigo', 'execução']);
  });

  it('a síntese fala de AFIRMAÇÕES, não do texto inteiro', () => {
    // Opinião não é afirmação pendente; incluí-la no denominador acusaria o
    // autor de algo que ele não fez. Mesma razão do GAP na ADR-003.
    const panel = buildScorePanel(makeAnalysis());
    if (panel.kind !== 'scored') throw new Error('esperado scored');

    // 3 SOURCED + 5 UNSOURCED = 8 afirmações; os 2 OPINION ficam de fora.
    expect(panel.summary).toContain('8 afirmações');
    expect(panel.summary).toContain('5 não citam fonte');
  });

  it('o breakdown cobre as três categorias, sempre', () => {
    const panel = buildScorePanel(makeAnalysis());
    if (panel.kind !== 'scored') throw new Error('esperado scored');

    expect(panel.breakdown.map((row) => row.category)).toEqual([
      'SOURCED',
      'UNSOURCED',
      'OPINION',
    ]);
  });

  it('estado sem score NÃO expõe métrica derivada nenhuma', () => {
    const panel = buildScorePanel(
      makeAnalysis({ outcome: { kind: 'unscored', reason: 'NO_CLAIMS_FOUND' } }),
    );

    expect(panel.kind).toBe('unscored');
    // A variante não tem campo numérico — nem score, nem breakdown, nem
    // percentual. Não é omissão de renderização: não existe o que vazar.
    expect(panel).not.toHaveProperty('score');
    expect(panel).not.toHaveProperty('breakdown');
  });

  it('cada razão de ausência tem explicação própria', () => {
    for (const reason of [
      'INSUFFICIENT_CONTENT',
      'NO_CLAIMS_FOUND',
      'INCONSISTENT_INPUT',
    ] as const) {
      const panel = buildScorePanel(
        makeAnalysis({ outcome: { kind: 'unscored', reason } }),
      );
      if (panel.kind !== 'unscored') throw new Error('esperado unscored');
      expect(panel.message.length, reason).toBeGreaterThan(40);
    }
  });

  it('percentual vira travessão quando não há denominador', () => {
    const panel = buildScorePanel(
      makeAnalysis({
        breakdown: {
          analyzableSentences: 0,
          sourced: 0,
          unsourced: 0,
          opinion: 0,
          factualDensity: 0,
          gapRate: null,
          llmEscalationRate: 0,
        },
      }),
    );
    if (panel.kind !== 'scored') throw new Error('esperado scored');
    expect(panel.breakdown.every((row) => row.percent === '—')).toBe(true);
  });
});

/**
 * A distinção que faltava: "não é analisável" e "não coube no limite" são
 * ausências diferentes, e rotular a segunda como a primeira atribui a ela uma
 * razão falsa.
 */
describe('buildSegments — as duas ausências', () => {
  const analyzable = makeSentences(3);
  const excluded: Sentence[] = [
    {
      id: 90,
      text: 'Um Título Qualquer',
      start: 0,
      end: 18,
      analyzable: false,
      excludedReason: 'heading',
    },
  ];

  it('sentença classificada vira segmento com categoria', () => {
    const analysis = makeAnalysis({
      sentences: analyzable,
      classifications: classifyAll(analyzable, 'SOURCED'),
    });

    const segments = buildSegments(analysis);
    expect(segments.every((s) => s.kind === 'classified')).toBe(true);
  });

  it('sentença ANALISÁVEL sem classificação é `unanalyzed`, não `excluded`', () => {
    // É o caso da truncagem: analisável, mas ficou fora do cap.
    const analysis = makeAnalysis({
      sentences: analyzable,
      classifications: classifyAll(analyzable.slice(0, 1)),
      truncated: true,
    });

    const segments = buildSegments(analysis);
    expect(segments.map((s) => s.kind)).toEqual([
      'classified',
      'unanalyzed',
      'unanalyzed',
    ]);
  });

  it('sentença NÃO analisável é `excluded` e diz o motivo real', () => {
    const analysis = makeAnalysis({
      sentences: [...analyzable, ...excluded],
      classifications: classifyAll(analyzable),
    });

    const segments = buildSegments(analysis);
    const last = segments.at(-1);
    expect(last?.kind).toBe('excluded');
    expect(last?.label).toContain('título');
  });

  it('nenhum segmento perde texto pelo caminho', () => {
    const analysis = makeAnalysis({
      sentences: [...analyzable, ...excluded],
      classifications: classifyAll(analyzable),
    });

    const segments = buildSegments(analysis);
    expect(segments).toHaveLength(4);
    expect(segments.map((s) => s.text)).toEqual(
      [...analyzable, ...excluded].map((s) => s.text),
    );
  });
});

describe('buildLegend — descreve só o que a tela contém', () => {
  it('não anuncia categoria ausente do texto', () => {
    const sentences = makeSentences(3);
    const analysis = makeAnalysis({
      sentences,
      classifications: classifyAll(sentences, 'SOURCED'),
    });

    const legend = buildLegend(buildSegments(analysis));
    expect(legend.map((entry) => entry.key)).toEqual(['SOURCED']);
  });

  it('anuncia `unanalyzed` quando há sentença fora do limite', () => {
    const sentences = makeSentences(3);
    const analysis = makeAnalysis({
      sentences,
      classifications: classifyAll(sentences.slice(0, 1), 'OPINION'),
      truncated: true,
    });

    const legend = buildLegend(buildSegments(analysis));
    expect(legend.map((entry) => entry.key)).toEqual(['OPINION', 'unanalyzed']);
  });

  it('toda entrada da legenda tem classe e rótulo', () => {
    const sentences = makeSentences(3);
    const analysis = makeAnalysis({
      sentences,
      classifications: classifyAll(sentences),
    });

    for (const entry of buildLegend(buildSegments(analysis))) {
      expect(entry.className.length).toBeGreaterThan(0);
      expect(entry.label.length).toBeGreaterThan(0);
    }
  });
});
