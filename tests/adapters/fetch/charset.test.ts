import { describe, expect, it } from 'vitest';

import {
  charsetFromContentType,
  charsetFromMetaTag,
  decodeHtml,
  normalizeEncoding,
} from '../../../src/adapters/fetch/charset.js';
import { loadMinFixtureBytes } from '../../helpers/fixtures.js';

/**
 * Regressão do bug: `toString('utf8')` incondicional, com o `content-type`
 * lido e descartado. Site PT-BR em latin-1 virava mojibake, e o dano não é
 * estético — as tabelas de sinais PT-BR são cheias de acento.
 */
describe('charsetFromContentType', () => {
  it('extrai o charset do header', () => {
    expect(charsetFromContentType('text/html; charset=utf-8')).toBe('utf-8');
    expect(charsetFromContentType('text/html;charset=ISO-8859-1')).toBe(
      'windows-1252',
    );
    expect(charsetFromContentType('text/html; charset="windows-1252"')).toBe(
      'windows-1252',
    );
  });

  it('devolve null quando não há charset', () => {
    expect(charsetFromContentType('text/html')).toBeNull();
    expect(charsetFromContentType(null)).toBeNull();
  });
});

describe('normalizeEncoding', () => {
  it('mapeia iso-8859-1 para windows-1252, como manda a especificação HTML', () => {
    // Páginas que declaram latin-1 na prática usam o intervalo 0x80–0x9F,
    // que só o cp1252 define.
    expect(normalizeEncoding('iso-8859-1')).toBe('windows-1252');
    expect(normalizeEncoding('latin1')).toBe('windows-1252');
  });

  it('devolve null para rótulo desconhecido', () => {
    expect(normalizeEncoding('nao-existe-9999')).toBeNull();
    expect(normalizeEncoding('')).toBeNull();
  });
});

describe('charsetFromMetaTag', () => {
  it('lê <meta charset>', () => {
    const bytes = Buffer.from('<html><head><meta charset="iso-8859-1">');
    expect(charsetFromMetaTag(bytes)).toBe('windows-1252');
  });

  it('lê <meta http-equiv="content-type">', () => {
    const bytes = Buffer.from(
      '<html><head><meta http-equiv="content-type" content="text/html; charset=windows-1252">',
    );
    expect(charsetFromMetaTag(bytes)).toBe('windows-1252');
  });

  it('não varre além dos primeiros 1024 bytes', () => {
    const bytes = Buffer.from(
      `<html><head>${' '.repeat(1200)}<meta charset="iso-8859-1">`,
    );
    expect(charsetFromMetaTag(bytes)).toBeNull();
  });
});

describe('decodeHtml — bytes latin-1 reais', () => {
  const latin1 = Buffer.from(
    'Segundo o IBGE, a inflação fechou 2024 em 4,8%. O relatório está estável.',
    'latin1',
  );

  it('decodifica corretamente quando o header declara iso-8859-1', () => {
    const { html, encoding } = decodeHtml(latin1, 'text/html; charset=iso-8859-1');
    expect(encoding).toBe('windows-1252');
    expect(html).toContain('inflação');
    expect(html).toContain('relatório');
    expect(html).toContain('está');
  });

  it('sem o charset, os acentos VIRAM MOJIBAKE — o bug original', () => {
    const { html } = decodeHtml(latin1, 'text/html');
    // Prova o dano: é isto que chegava às tabelas de sinais antes da correção.
    expect(html).not.toContain('inflação');
    expect(html).toContain('�');
  });

  it('o header tem precedência sobre o <meta>', () => {
    const bytes = Buffer.concat([
      Buffer.from('<meta charset="utf-8">'),
      latin1,
    ]);
    const { encoding } = decodeHtml(bytes, 'text/html; charset=iso-8859-1');
    expect(encoding).toBe('windows-1252');
  });

  it('cai para o <meta> quando o header não declara', () => {
    const bytes = Buffer.concat([
      Buffer.from('<meta charset="iso-8859-1">'),
      latin1,
    ]);
    const { html, encoding } = decodeHtml(bytes, 'text/html');
    expect(encoding).toBe('windows-1252');
    expect(html).toContain('inflação');
  });

  it('cai para UTF-8 quando nada é declarado', () => {
    const utf8 = Buffer.from('inflação', 'utf8');
    const { html, encoding } = decodeHtml(utf8, null);
    expect(encoding).toBe('utf-8');
    expect(html).toBe('inflação');
  });

  it('encoding desconhecido não derruba a análise', () => {
    const { encoding } = decodeHtml(
      Buffer.from('ok'),
      'text/html; charset=inexistente-9999',
    );
    expect(encoding).toBe('utf-8');
  });
});

describe('decodeHtml — fixture latin-1 versionada', () => {
  it('decodifica o fixture real gravado em cp1252', () => {
    const bytes = loadMinFixtureBytes('pt-latin1.html');
    const { html } = decodeHtml(bytes, 'text/html');
    // O charset vem do <meta http-equiv> do próprio arquivo.
    expect(html).toContain('inflação');
    expect(html).toContain('projeção');
    expect(html).toContain('milhões');
    expect(html).not.toContain('�');
  });
});
