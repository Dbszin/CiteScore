import { describe, expect, it } from 'vitest';

import type { Classification } from '../../../src/core/domain/classification.js';
import { computeScore } from '../../../src/core/scoring/compute-score.js';
import { MIN_ANALYZABLE_SENTENCES } from '../../../src/core/scoring/weights.js';

function make(
  spec: Partial<Record<'sourced' | 'unsourced' | 'opinion', number>>,
  decidedBy: 'rules' | 'llm' = 'llm',
): Classification[] {
  const out: Classification[] = [];
  let id = 0;
  const push = (category: Classification['category'], count: number) => {
    for (let i = 0; i < count; i += 1) {
      out.push({
        sentenceId: id++,
        category,
        confidence: 0.9,
        decidedBy,
        signals: [],
      });
    }
  };
  push('SOURCED', spec.sourced ?? 0);
  push('UNSOURCED', spec.unsourced ?? 0);
  push('OPINION', spec.opinion ?? 0);
  return out;
}

describe('computeScore', () => {
  it('é função pura: sem import de infraestrutura', () => {
    // A pureza é garantida pela regra de lint em src/core/**.
    // Aqui verificamos determinismo: mesma entrada, mesma saída.
    const input = make({ sourced: 10, unsourced: 5, opinion: 5 });
    const a = computeScore(input, 20);
    const b = computeScore(input, 20);
    expect(a).toEqual(b);
  });

  describe('tabela de casos normais', () => {
    // FD = S/N ; GAP = U/(S+U) ; score = round(100*(0.6*FD + 0.4*(1-GAP)))
    const cases = [
      // N=20, tudo sustentado: FD=1.0, GAP=0 -> 100
      { s: 20, u: 0, o: 0, n: 20, expected: 100 },
      // N=20, metade das afirmações sem fonte: FD=0.5, GAP=0.5 -> 60*0.5+40*0.5=50
      { s: 10, u: 10, o: 0, n: 20, expected: 50 },
      // N=20, 10 sustentadas + 10 opinião: FD=0.5, GAP=0 -> 30+40=70
      { s: 10, u: 0, o: 10, n: 20, expected: 70 },
      // N=20, tudo sem fonte: FD=0, GAP=1 -> 0
      { s: 0, u: 20, o: 0, n: 20, expected: 0 },
      // N=40, 12 sustentadas, 8 sem fonte, 20 opinião: FD=0.3, GAP=0.4
      // -> 60*0.3 + 40*0.6 = 18+24 = 42
      { s: 12, u: 8, o: 20, n: 40, expected: 42 },
    ];

    for (const { s, u, o, n, expected } of cases) {
      it(`S=${s} U=${u} O=${o} N=${n} -> ${expected}`, () => {
        const result = computeScore(make({ sourced: s, unsourced: u, opinion: o }), n);
        expect(result.outcome).toEqual({ kind: 'scored', score: expected });
      });
    }
  });

  describe('casos de borda de ADR-003', () => {
    it('N abaixo do mínimo retorna INSUFFICIENT_CONTENT, não score zero', () => {
      const result = computeScore(make({ sourced: 5, unsourced: 4 }), 9);
      expect(result.outcome).toEqual({
        kind: 'unscored',
        reason: 'INSUFFICIENT_CONTENT',
      });
    });

    it('N exatamente no mínimo já pontua', () => {
      const result = computeScore(
        make({ sourced: 5, unsourced: 5 }),
        MIN_ANALYZABLE_SENTENCES,
      );
      expect(result.outcome.kind).toBe('scored');
    });

    it('texto 100% opinião retorna NO_CLAIMS_FOUND, nunca um score', () => {
      const result = computeScore(make({ opinion: 30 }), 30);
      expect(result.outcome).toEqual({
        kind: 'unscored',
        reason: 'NO_CLAIMS_FOUND',
      });
      // Calcular 1-GAP=1 daria bônus máximo a quem não afirmou nada.
      expect(result.breakdown.gapRate).toBeNull();
    });

    it('N=0 não lança nem divide por zero', () => {
      const result = computeScore([], 0);
      expect(result.outcome).toEqual({
        kind: 'unscored',
        reason: 'INSUFFICIENT_CONTENT',
      });
      expect(result.breakdown.factualDensity).toBe(0);
      expect(Number.isNaN(result.breakdown.factualDensity)).toBe(false);
    });

    it('sem afirmação sem fonte, gapRate é 0 e o termo vale 1', () => {
      const result = computeScore(make({ sourced: 15, opinion: 5 }), 20);
      expect(result.breakdown.gapRate).toBe(0);
    });
  });

  describe('invariantes de produto', () => {
    it('texto todo sustentado pontua acima do mesmo texto com metade sem fonte', () => {
      const todoSustentado = computeScore(make({ sourced: 20 }), 20);
      const metadeSemFonte = computeScore(make({ sourced: 10, unsourced: 10 }), 20);

      expect(todoSustentado.outcome.kind).toBe('scored');
      expect(metadeSemFonte.outcome.kind).toBe('scored');
      if (
        todoSustentado.outcome.kind === 'scored' &&
        metadeSemFonte.outcome.kind === 'scored'
      ) {
        expect(todoSustentado.outcome.score).toBeGreaterThan(
          metadeSemFonte.outcome.score,
        );
      }
    });

    it('opinião DILUI a densidade mas não é penalizada pelo termo de lacuna', () => {
      // Mesmas afirmações (todas sustentadas), muito mais opinião ao redor.
      const poucaOpiniao = computeScore(make({ sourced: 10, opinion: 2 }), 12);
      const muitaOpiniao = computeScore(make({ sourced: 10, opinion: 40 }), 50);

      if (
        poucaOpiniao.outcome.kind === 'scored' &&
        muitaOpiniao.outcome.kind === 'scored'
      ) {
        // Dilui: pontua menos.
        expect(muitaOpiniao.outcome.score).toBeLessThan(poucaOpiniao.outcome.score);
        // Mas o termo de lacuna permanece perfeito nos dois: nada pendurado.
        expect(poucaOpiniao.breakdown.gapRate).toBe(0);
        expect(muitaOpiniao.breakdown.gapRate).toBe(0);
        // E não zera: artigo editorial com fontes não é tratado como defeito.
        expect(muitaOpiniao.outcome.score).toBeGreaterThanOrEqual(40);
      }
    });
  });

  it('llmEscalationRate reflete a fração decidida pelo LLM', () => {
    const porRegra = make({ sourced: 5 }, 'rules');
    const porLlm = make({ unsourced: 5 }, 'llm');
    const result = computeScore([...porRegra, ...porLlm], 10);
    expect(result.breakdown.llmEscalationRate).toBe(0.5);
  });
});
