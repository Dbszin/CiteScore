import { describe, expect, it } from 'vitest';

import {
  DISCLAIMER_PT_BR,
  buildMethodology,
} from '../../src/core/domain/methodology.js';
import { SCORE_VERSION } from '../../src/core/scoring/weights.js';

/**
 * ADR-004: a honestidade do score é CONTRATO, não copy de UI.
 *
 * Este arquivo existe para que a ressalva sobreviva a redesign, a screenshot
 * e a troca de quem escreve o texto. Se alguém remover o disclaimer do
 * payload, o teste falha antes de o produto afirmar algo que nunca mediu.
 */
describe('Contrato de metodologia (ADR-004)', () => {
  const methodology = buildMethodology('/metodologia');

  it('declara o tipo como proxy heurístico', () => {
    expect(methodology.kind).toBe('heuristic_proxy');
  });

  it('afirma explicitamente que NÃO mediu citações', () => {
    expect(methodology.measuredCitations).toBe(false);
  });

  it('traz disclaimer não vazio', () => {
    expect(methodology.disclaimer.length).toBeGreaterThan(80);
  });

  it('o disclaimer nega medição de citação em motores de AI', () => {
    const texto = methodology.disclaimer.toLowerCase();
    expect(texto).toContain('estimativa');
    expect(texto).toContain('não');
    // Nomeia os motores para não deixar dúvida sobre o que não foi feito.
    expect(texto).toMatch(/chatgpt|perplexity|ai overviews/u);
  });

  it('o disclaimer NÃO promete medição de citabilidade', () => {
    const texto = DISCLAIMER_PT_BR.toLowerCase();
    expect(texto).not.toMatch(/medimos\s+(?:a\s+)?citabilidade/u);
    expect(texto).not.toMatch(/citações\s+medidas/u);
  });

  it('aponta para a metodologia, acessível a um clique', () => {
    expect(methodology.methodologyUrl.length).toBeGreaterThan(0);
  });

  it('todos os campos obrigatórios estão presentes', () => {
    // Um payload sem qualquer um destes campos é inaceitável por ADR-004.
    for (const key of [
      'kind',
      'measuredCitations',
      'disclaimer',
      'methodologyUrl',
    ] as const) {
      expect(methodology[key], key).toBeDefined();
    }
  });
});

describe('Versionamento do score (ADR-003)', () => {
  it('SCORE_VERSION segue semver', () => {
    expect(SCORE_VERSION).toMatch(/^\d+\.\d+\.\d+$/u);
  });
});
