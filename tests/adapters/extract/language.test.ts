import { describe, expect, it } from 'vitest';

import {
  detectByStopwords,
  detectLanguage,
  normalizeLanguageTag,
} from '../../../src/adapters/extract/language.js';

/**
 * Este módulo decide `UNSUPPORTED_LANGUAGE` — um caminho de erro visível ao
 * usuário — e até agora não tinha nenhum teste direto. A heurística de
 * margem (1.2) nunca havia sido exercitada.
 */
describe('normalizeLanguageTag', () => {
  it('normaliza variantes de português', () => {
    for (const tag of ['pt', 'pt-BR', 'pt-br', 'PT-PT', 'pt_BR', ' pt-BR ']) {
      expect(normalizeLanguageTag(tag), tag).toBe('pt-BR');
    }
  });

  it('normaliza variantes de inglês', () => {
    for (const tag of ['en', 'en-US', 'EN-GB', 'en_AU']) {
      expect(normalizeLanguageTag(tag), tag).toBe('en');
    }
  });

  it('devolve null para idioma não suportado', () => {
    for (const tag of ['es', 'fr', 'de', 'ja', 'zh-CN', 'it']) {
      expect(normalizeLanguageTag(tag), tag).toBeNull();
    }
  });

  it('devolve null para entrada vazia ou ausente', () => {
    expect(normalizeLanguageTag(null)).toBeNull();
    expect(normalizeLanguageTag(undefined)).toBeNull();
    expect(normalizeLanguageTag('')).toBeNull();
    expect(normalizeLanguageTag('   ')).toBeNull();
  });
});

describe('detectByStopwords', () => {
  const pt =
    'A densidade factual de um texto mede quanto das afirmacoes que ele faz ' +
    'estao sustentadas por dados ou por fontes. O calculo considera apenas ' +
    'as sentencas que podem ser analisadas, e o resultado nao e uma medicao ' +
    'de citacoes reais, mas uma estimativa derivada dessa proporcao.';

  const en =
    'The factual density of a text measures how much of what it claims is ' +
    'backed by data or by a source. The calculation considers only the ' +
    'sentences that can be analyzed, and the result is not a measurement of ' +
    'real citations, but an estimate derived from that proportion.';

  it('identifica português', () => {
    expect(detectByStopwords(pt)).toBe('pt-BR');
  });

  it('identifica inglês', () => {
    expect(detectByStopwords(en)).toBe('en');
  });

  it('devolve null sem sinal algum', () => {
    expect(detectByStopwords('')).toBeNull();
    expect(detectByStopwords('123 456 789')).toBeNull();
    expect(detectByStopwords('xyz qwerty zzz')).toBeNull();
  });

  it('devolve null em empate técnico — margem de 1.2 não é atingida', () => {
    // Empate técnico não é detecção. Chutar aqui produziria tabela de sinais
    // errada e score sem sentido, em vez de UNSUPPORTED_LANGUAGE honesto.
    expect(detectByStopwords('the de the de the de')).toBeNull();
  });

  it('decide quando uma língua domina com folga', () => {
    expect(detectByStopwords(`${pt} the of and`)).toBe('pt-BR');
    expect(detectByStopwords(`${en} de da do`)).toBe('en');
  });
});

describe('detectLanguage — precedência', () => {
  const textoPt = 'A analise considera apenas as sentencas que podem ser lidas.';

  it('a tag declarada tem precedência sobre o texto', () => {
    expect(detectLanguage(['en-US'], textoPt)).toBe('en');
  });

  it('usa a primeira tag válida da lista', () => {
    expect(detectLanguage([null, undefined, 'pt-BR', 'en'], textoPt)).toBe(
      'pt-BR',
    );
  });

  it('ignora tag de idioma não suportado e cai no texto', () => {
    expect(detectLanguage(['es-ES'], textoPt)).toBe('pt-BR');
  });

  it('devolve null quando nada resolve — vira UNSUPPORTED_LANGUAGE', () => {
    expect(detectLanguage([null], '123 456')).toBeNull();
    expect(detectLanguage(['ja'], 'xyz qwerty')).toBeNull();
  });
});
