import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Trava a cascata do highlight inline com um motor de CSS de verdade.
 *
 * Este teste existe porque um bug real passou por revisão de código: a regra
 * `.manuscript mark { background: transparent }` tem especificidade (0,1,1) e vencia
 * as regras `.cat-*`, de (0,1,0). Todo destaque no texto ficava sem fundo,
 * enquanto a LEGENDA — que usa outro seletor e não colidia — mostrava as
 * cores. A tela não parecia quebrada; parecia uma decisão de design.
 *
 * Ler CSS foi como o bug entrou, então a verificação não pode ser leitura.
 *
 * ⚠️ LIMITE MEDIDO DO ORÁCULO, e é importante conhecê-lo antes de confiar.
 *
 * O `jsdom` aplica ORDEM DE ORIGEM e IGNORA especificidade. Verificado:
 *
 *   `.manuscript mark {red}` antes de `.cat-X {blue}`  -> jsdom diz blue
 *   `.cat-X {blue}` antes de `.manuscript mark {red}`  -> jsdom diz red
 *
 * O CSS de verdade daria `red` nos dois casos, porque (0,1,1) vence (0,1,0).
 * Ou seja: estes testes pegam "regra POSTERIOR rouba o fundo", e NÃO pegam
 * "regra anterior de maior especificidade rouba o fundo". O bug original caiu
 * na primeira categoria — foi sorte de ordem, não modelagem de cascata.
 *
 * Por isso existe `guarda-estrutural.test.ts`, que verifica no FONTE que
 * nenhuma regra descendente mira `mark`. Essa é a defesa que não depende do
 * jsdom.
 *
 * Outro limite: o `jsdom` não resolve `var()`. Os testes assertam qual
 * DECLARAÇÃO vence, não a cor final — que é exatamente o que estava errado.
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
      `<div class="manuscript">${marks}` +
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

/**
 * Cor NUNCA é o único canal (design-visual.md § 3).
 *
 * A versão anterior distinguia as três categorias SÓ por cor — invisível para
 * quem não distingue cor e em impressão preto e branco. Cada uma tem agora um
 * traço próprio no sublinhado, e é isso que estes testes travam.
 */
describe('Traço distinto por categoria — acessibilidade multicanal', () => {
  it('as três categorias têm estilos de linha DIFERENTES entre si', () => {
    const estilos = CATEGORIES.map(
      (categoria) => styleOf(`mark-${categoria}`).borderBottomStyle,
    );

    expect(estilos).toEqual(['solid', 'dashed', 'dotted']);
    // Se um dia virarem todos iguais, a distinção volta a ser só cromática.
    expect(new Set(estilos).size).toBe(CATEGORIES.length);
  });

  it('todas têm espessura de traço visível', () => {
    for (const categoria of CATEGORIES) {
      expect(styleOf(`mark-${categoria}`).borderBottomWidth, categoria).toBe('2px');
    }
  });

  it('as amostras da legenda usam o MESMO traço do texto', () => {
    // A legenda prometendo um código que o texto não entrega foi exatamente
    // o sintoma que tornou o bug anterior enganoso.
    for (const categoria of CATEGORIES) {
      expect(
        styleOf(`legend-${categoria}`).borderBottomStyle,
        categoria,
      ).toBe(styleOf(`mark-${categoria}`).borderBottomStyle);
    }
  });
});
