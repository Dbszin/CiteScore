import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Trava a cascata do highlight inline com um motor de CSS de verdade.
 *
 * Este teste existe porque um bug real passou por revisão de código: a regra
 * `.text mark { background: transparent }` tem especificidade (0,1,1) e vencia
 * as regras `.cat-*`, de (0,1,0). Todo destaque no texto ficava sem fundo,
 * enquanto a LEGENDA — que usa outro seletor e não colidia — mostrava as
 * cores. A tela não parecia quebrada; parecia uma decisão de design.
 *
 * Ler CSS foi como o bug entrou, então a verificação não pode ser leitura.
 * O `jsdom` resolve a cascata por especificidade de fato, e foi confirmado
 * que ele REPRODUZ o bug na versão antiga — ou seja, é um oráculo que sabe
 * falhar, não um teste que passa por acidente.
 *
 * Limite conhecido: o `jsdom` não resolve `var()`. O teste asserta qual
 * DECLARAÇÃO vence, não a cor final. É exatamente o que estava errado.
 */

const CATEGORIES = ['SOURCED', 'UNSOURCED', 'OPINION'] as const;

let win: JSDOM['window'];

beforeAll(() => {
  const css = readFileSync('src/app/globals.css', 'utf8');
  const marks = CATEGORIES.map(
    (category) =>
      `<mark class="cat-${category}" id="mark-${category}">texto</mark>`,
  ).join('');
  const legend = CATEGORIES.map(
    (category) =>
      `<span class="cat-${category}" id="legend-${category}">rótulo</span>`,
  ).join('');

  const dom = new JSDOM(
    `<!doctype html><html><head><style>${css}</style></head><body>` +
      `<div class="legend">${legend}</div>` +
      `<div class="text">${marks}` +
      `<span class="unanalyzed" id="unanalyzed">fora do limite</span>` +
      `<span class="excluded" id="excluded">título</span>` +
      `</div></body></html>`,
  );
  win = dom.window;
});

function styleOf(id: string): CSSStyleDeclaration {
  const element = win.document.getElementById(id);
  if (element === null) throw new Error(`elemento ${id} não encontrado`);
  return win.getComputedStyle(element);
}

function backgroundOf(id: string): string {
  return styleOf(id).background;
}

describe('Cascata do highlight inline', () => {
  it.each(CATEGORIES)(
    'o fundo de cat-%s sobrevive dentro de .text',
    (category) => {
      const background = backgroundOf(`mark-${category}`);

      // O bug produzia exatamente 'rgba(0, 0, 0, 0)' aqui.
      expect(background).not.toBe('rgba(0, 0, 0, 0)');
      expect(background).toContain('var(--');
    },
  );

  it.each(CATEGORIES)(
    'a legenda e o texto usam a MESMA cor para cat-%s',
    (category) => {
      // A divergência entre os dois é o sintoma que tornava o bug enganoso:
      // a legenda prometia um código visual que o texto não entregava.
      expect(backgroundOf(`mark-${category}`)).toBe(
        backgroundOf(`legend-${category}`),
      );
    },
  );

  it('as três categorias são visualmente distintas entre si', () => {
    const backgrounds = CATEGORIES.map((category) =>
      backgroundOf(`mark-${category}`),
    );
    expect(new Set(backgrounds).size).toBe(CATEGORIES.length);
  });

  it('`unanalyzed` e `excluded` não renderizam idênticos', () => {
    // São ausências semanticamente diferentes: uma é "não coube no limite",
    // a outra é "não é analisável". Parecer a mesma coisa atribui a uma delas
    // uma razão falsa.
    expect(styleOf('unanalyzed').borderBottomStyle).toBe('dashed');
    expect(styleOf('excluded').borderBottomStyle).toBe('');
  });
});
