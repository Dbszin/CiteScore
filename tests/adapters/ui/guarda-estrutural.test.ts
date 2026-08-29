import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Guarda que NÃO depende do jsdom.
 *
 * O teste de cascata mede o estilo computado, mas foi verificado que o `jsdom`
 * aplica ordem de origem e IGNORA especificidade — então ele não pega uma
 * regra anterior de maior especificidade roubando o fundo do destaque, que é
 * a forma exata do bug que já aconteceu neste projeto.
 *
 * Este arquivo guarda a propriedade ESTRUTURAL que torna a classe inteira de
 * bug impossível: nenhuma regra descendente mira `mark`. Todo o desenho do
 * destaque vive no seletor de elemento `mark`, de especificidade (0,0,1), e
 * nas classes `.cat-*`, de (0,1,0) — que assim nunca competem.
 */

/** Comentários fora: eles citam os seletores perigosos ao explicá-los. */
const CSS = readFileSync('src/app/globals.css', 'utf8').replace(
  /\/\*[\s\S]*?\*\//gu,
  '',
);

const CATEGORIAS = ['SOURCED', 'UNSOURCED', 'OPINION'] as const;

/**
 * Seletores como `.algo mark`, `div mark`, `.a > mark` — os perigosos.
 *
 * O primeiro `[^\s{}]` exige um seletor REAL antes do combinador. Sem ele, a
 * quebra de linha que precede um `mark {` no início da linha conta como
 * combinador e o proprio reset vira falso positivo.
 */
const DESCENDENTE_MIRANDO_MARK = /[^\s{}][^{}]*[\s>+~]mark\b[^{}]*\{/gu;

describe('Guarda estrutural do destaque inline', () => {
  it('nenhuma regra descendente mira `mark`', () => {
    const encontrados = [...CSS.matchAll(DESCENDENTE_MIRANDO_MARK)].map((match) =>
      match[0].replace(/\s+/gu, ' ').trim(),
    );

    // Uma regra `.x mark` tem especificidade (0,1,1) e vence as classes de
    // categoria, de (0,1,0) — independente da ordem em que aparecem. Foi assim
    // que todo destaque ficou sem fundo, e a tela não pareceu quebrada: a cor
    // do texto ainda diferenciava, e a legenda mostrava as cores que o texto
    // não tinha.
    expect(encontrados).toEqual([]);
  });

  it('as três categorias declaram fundo, cor e traço', () => {
    for (const categoria of CATEGORIAS) {
      const bloco = new RegExp(String.raw`\.cat-${categoria}\s*\{([^}]*)\}`, 'u').exec(
        CSS,
      );
      expect(bloco, categoria).not.toBeNull();

      const corpo = bloco?.[1] ?? '';
      expect(corpo, `${categoria} sem fundo`).toContain('background:');
      expect(corpo, `${categoria} sem cor`).toContain('color:');
      expect(corpo, `${categoria} sem traço`).toContain('border-bottom-style:');
    }
  });

  it('o reset de `mark` fica no seletor de ELEMENTO', () => {
    // Se ele migrar para uma classe ou um descendente, passa a competir com
    // as categorias e o bug volta.
    expect(CSS).toMatch(/^mark\s*\{/mu);
  });
});
