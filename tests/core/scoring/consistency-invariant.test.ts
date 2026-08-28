import { describe, expect, it } from 'vitest';

import type { Classification } from '../../../src/core/domain/classification.js';
import { computeScore } from '../../../src/core/scoring/compute-score.js';

/**
 * Regressão do achado crítico da terceira revisão.
 *
 * Id duplicado na resposta do modelo produzia mais classificações que
 * sentenças analisáveis, e a aritmética seguia em frente:
 *
 *   N=10 analisáveis, 15 classificações SOURCED
 *   -> factualDensity = 1,5 (150%)
 *   -> score = 130          num produto que apresenta 0–100
 *
 * `computeScore` é a última barreira: ela protege independentemente de qual
 * camada acima tenha errado. Antes desta correção, ela somava as categorias
 * e nunca comparava com `analyzableCount`.
 */

function classifications(
  count: number,
  category: Classification['category'],
): Classification[] {
  return Array.from({ length: count }, (_, index) => ({
    sentenceId: index,
    category,
    confidence: 0.9,
    decidedBy: 'llm' as const,
    signals: [],
  }));
}

describe('computeScore — invariante de consistência', () => {
  it('NÃO emite score quando há mais classificações que sentenças analisáveis', () => {
    const result = computeScore(classifications(15, 'SOURCED'), 10);
    expect(result.outcome).toEqual({
      kind: 'unscored',
      reason: 'INCONSISTENT_INPUT',
    });
  });

  it('o caso exato medido na revisão: 15 SOURCED com N=12', () => {
    const result = computeScore(classifications(15, 'SOURCED'), 12);
    expect(result.outcome.kind).toBe('unscored');
  });

  it('o breakdown expõe a inconsistência em vez de escondê-la', () => {
    // Decisão deliberada: NÃO clampar a densidade em 1. Clampar produziria um
    // breakdown que parece normal e apagaria o sintoma. O que protege o
    // usuário é o `outcome: unscored`, verificado acima; o breakdown serve a
    // quem investiga, e para isso precisa mostrar os números como são.
    //
    // A consequência é um requisito de UI, já registrado em
    // specs/.../ui-relatorio/spec.md: estado `unscored` tem tratamento visual
    // próprio e NÃO renderiza métricas derivadas.
    const result = computeScore(classifications(15, 'SOURCED'), 10);
    expect(result.outcome.kind).toBe('unscored');
    expect(result.breakdown.sourced).toBeGreaterThan(
      result.breakdown.analyzableSentences,
    );
    // A densidade impossível é o sintoma visível, não um valor a apresentar.
    expect(result.breakdown.factualDensity).toBeGreaterThan(1);
  });

  it('score nunca passa de 100 — varredura de combinações inconsistentes', () => {
    for (let extra = 1; extra <= 20; extra += 1) {
      for (const n of [10, 12, 25, 50]) {
        const result = computeScore(classifications(n + extra, 'SOURCED'), n);
        if (result.outcome.kind === 'scored') {
          expect(
            result.outcome.score,
            `N=${n}, classificações=${n + extra}`,
          ).toBeLessThanOrEqual(100);
        }
      }
    }
  });

  it('menos classificações que N continua sendo aceito', () => {
    // Nem toda sentença analisável precisa ter classificação: o pipeline
    // pode legitimamente entregar menos (ex.: lote truncado sinalizado).
    // O que não pode é entregar MAIS.
    const result = computeScore(classifications(8, 'SOURCED'), 10);
    expect(result.outcome.kind).toBe('scored');
  });

  it('exatamente N classificações é o caso normal', () => {
    const result = computeScore(classifications(10, 'SOURCED'), 10);
    expect(result.outcome).toEqual({ kind: 'scored', score: 100 });
  });

  it('o breakdown é preenchido mesmo quando o score não é emitido', () => {
    // Quem investiga precisa ver os números que causaram a recusa.
    const result = computeScore(classifications(15, 'SOURCED'), 10);
    expect(result.breakdown.sourced).toBe(15);
    expect(result.breakdown.analyzableSentences).toBe(10);
  });
});
