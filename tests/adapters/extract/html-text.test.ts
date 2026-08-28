import { parseHTML } from 'linkedom';
import { describe, expect, it } from 'vitest';

import {
  blockAwareText,
  normalizeText,
} from '../../../src/adapters/extract/html-text.js';

function textOf(html: string): string {
  // Documento COMPLETO de propósito: `parseHTML` com fragmento promove o
  // primeiro elemento a documentElement e deixa `body` vazio — foi
  // exatamente o bug que `pickContentRoot` resolve no extrator.
  const { document } = parseHTML(
    `<!doctype html><html><body>${html}</body></html>`,
  );
  const body = document.body;
  if (body === null || body.childNodes.length === 0) {
    throw new Error('fixture de teste inválida: body vazio');
  }
  return blockAwareText(body as never);
}

/**
 * ==== CORREÇÃO 1 DO BENCHMARK ====
 * O defeito real medido: `Readability.textContent` produziu
 * "...to visitors.Every web page..." e "2026August 2026 Security Release".
 * O Intl.Segmenter não quebra isso — trata como UMA sentença.
 */
describe('blockAwareText — separação de blocos', () => {
  it('NÃO gruda sentenças de parágrafos vizinhos (o defeito do benchmark)', () => {
    const text = textOf(
      '<p>They also tell web browsers how to display it to visitors.</p>' +
        '<p>Every web page has meta tags.</p>',
    );
    expect(text).not.toContain('visitors.Every');
    expect(text).toContain('visitors.');
    expect(text).toContain('Every web page');
  });

  it('reproduz o segundo caso medido: data grudada no título', () => {
    const text = textOf(
      '<div>August 25th, 2026</div><h3>August 2026 Security Release</h3>',
    );
    expect(text).not.toContain('2026August');
    // Asserção positiva também: sem ela, um texto vazio passaria o `not`.
    expect(text.split('\n')).toEqual([
      'August 25th, 2026',
      'August 2026 Security Release',
    ]);
  });

  it('coloca um bloco por linha — é o que permite detectar heading', () => {
    const text = textOf(
      '<h2>What is SEO</h2><p>SEO stands for search engine optimization.</p>',
    );
    expect(text.split('\n')).toEqual([
      'What is SEO',
      'SEO stands for search engine optimization.',
    ]);
  });

  it('separa itens de lista em linhas distintas', () => {
    const text = textOf('<ul><li>Primeiro item</li><li>Segundo item</li></ul>');
    expect(text.split('\n')).toEqual(['Primeiro item', 'Segundo item']);
  });

  it('trata <br> como fronteira de linha', () => {
    const text = textOf('<p>Linha um<br>Linha dois</p>');
    expect(text.split('\n')).toEqual(['Linha um', 'Linha dois']);
  });

  it('não gruda elementos inline entre si', () => {
    const text = textOf('<p><strong>Meta tags</strong><em>are</em> snippets.</p>');
    expect(text).toContain('Meta tags are snippets.');
  });

  it('descarta script, style e noscript', () => {
    const text = textOf(
      '<p>Conteúdo real.</p><script>var x=1;</script><style>.a{color:red}</style>',
    );
    expect(text).toBe('Conteúdo real.');
  });

  it('preserva decimais em PT-BR', () => {
    const text = textOf('<p>A inflação foi de 4,8% em 2024.</p>');
    expect(text).toContain('4,8%');
  });
});

describe('normalizeText', () => {
  it('remove o espaço injetado antes de pontuação', () => {
    expect(normalizeText('visitors . Every')).toBe('visitors. Every');
    expect(normalizeText('78 %')).toBe('78%');
    expect(normalizeText('texto , seguido')).toBe('texto, seguido');
  });

  it('colapsa espaços horizontais e NBSP', () => {
    expect(normalizeText('a   b c')).toBe('a b c');
  });

  it('colapsa múltiplas quebras em uma só', () => {
    expect(normalizeText('a\n\n\n b')).toBe('a\nb');
  });
});
