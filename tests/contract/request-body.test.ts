import { describe, expect, it } from 'vitest';

import {
  readIncludeSuggestions,
  readRefresh,
} from '../../src/app/api/analyze/request-body.js';

/**
 * Os DEFAULTS do corpo da requisição.
 *
 * Existe porque uma sabotagem passou: inverter o default de `refresh` não
 * quebrava teste nenhum, e o efeito seria todo cliente furando o cache sem
 * saber. Não produz erro — produz uma conta maior, em silêncio, que é a pior
 * combinação possível.
 */

describe('readRefresh — default FALSE', () => {
  it.each([
    ['corpo vazio', {}],
    ['corpo nulo', null],
    ['corpo que não é objeto', 'texto'],
    ['campo ausente', { url: 'https://x.test' }],
    ['campo explicitamente false', { refresh: false }],
  ])('%s NÃO fura o cache', (_rotulo, corpo) => {
    expect(readRefresh(corpo)).toBe(false);
  });

  it('só `true` booleano liga o refresh', () => {
    expect(readRefresh({ refresh: true })).toBe(true);
  });

  it.each([
    ['string "true"', { refresh: 'true' }],
    ['número 1', { refresh: 1 }],
    ['string "1"', { refresh: '1' }],
  ])('%s NÃO liga — sem coerção', (_rotulo, corpo) => {
    // Aceitar coerção deixaria um cliente mal escrito furar o cache sem
    // intenção, e o autor dele jamais saberia.
    expect(readRefresh(corpo)).toBe(false);
  });
});

describe('readIncludeSuggestions — default TRUE', () => {
  it('os dois defaults são OPOSTOS, e isso é deliberado', () => {
    // Omitir sugestões pede o comportamento mais completo; omitir refresh pede
    // o mais barato. Alinhá-los por simetria quebraria um dos dois.
    expect(readIncludeSuggestions({})).toBe(true);
    expect(readRefresh({})).toBe(false);
  });

  it('respeita `false` explícito', () => {
    expect(readIncludeSuggestions({ includeSuggestions: false })).toBe(false);
  });

  it('valor não booleano cai no default', () => {
    expect(readIncludeSuggestions({ includeSuggestions: 'sim' })).toBe(true);
  });
});
