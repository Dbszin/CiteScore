import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Trava a cascata do destaque inline com um motor de CSS de verdade.
 *
 * Este teste existe porque um bug real passou por revisão de código: a regra
 * `.manuscript mark { background: transparent }` tem especificidade (0,1,1) e
 * vencia as regras `.cat-*`, de (0,1,0). Todo destaque no texto ficava sem
 * fundo, enquanto a LEGENDA — que usa outro seletor e não colidia — mostrava
 * as cores. A tela não parecia quebrada; parecia uma decisão de design.
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

  // O destaque no texto: `mark.cat-*` dentro da folha, como em `analyzer.tsx`.
  const marks = CATEGORIES.map(
    (category) =>
      `<span class="pop-wrap"><mark class="cat-${category}" id="mark-${category}">` +
      `<button class="sentence" type="button">texto</button></mark></span>`,
  ).join('');

  /*
   * A legenda na direção "Precisão Escura" NÃO usa as tintas: ela vive na
   * interface escura, onde as tintas de categoria não têm contraste. Ela usa
   * amostra de TRAÇO (`.stroke-*`), e é a correspondência entre esse traço e o
   * sublinhado do texto que precisa ser travada agora.
   */
  const legend = CATEGORIES.map(
    (category) =>
      `<span class="legend-item"><span class="stroke stroke-${category}" ` +
      `id="stroke-${category}"></span>rótulo</span>`,
  ).join('');

  const dom = new JSDOM(
    `<!doctype html><html><head><style>${css}</style></head><body>` +
      `<div class="legend">${legend}</div>` +
      `<div class="sheet"><div class="sheet-inner">${marks}` +
      `<span class="unanalyzed" id="unanalyzed">fora do limite</span>` +
      `<span class="excluded" id="excluded">título</span>` +
      `</div></div></body></html>`,
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

describe('Cascata do destaque inline', () => {
  it.each(CATEGORIES)(
    'o fundo de cat-%s sobrevive dentro da folha',
    (category) => {
      const background = backgroundOf(`mark-${category}`);

      // O bug produzia exatamente 'rgba(0, 0, 0, 0)' aqui.
      expect(background).not.toBe('rgba(0, 0, 0, 0)');
      expect(background).toContain('var(--');
    },
  );

  it('as três categorias são visualmente distintas entre si', () => {
    const backgrounds = CATEGORIES.map((category) =>
      backgroundOf(`mark-${category}`),
    );
    expect(new Set(backgrounds).size).toBe(CATEGORIES.length);
  });

  it('o botão interno não rouba o fundo do destaque', () => {
    // O texto da sentença é um `<button>` para ter teclado de graça. Se ele
    // ganhasse fundo próprio, cobriria o destaque de dentro para fora — mesmo
    // sintoma do bug original, causa diferente.
    const css = readFileSync('src/app/globals.css', 'utf8');
    const bloco = /\.sentence\s*\{([^}]*)\}/u.exec(css);
    expect(bloco).not.toBeNull();
    expect(bloco?.[1]).toContain('background: none');
  });

  it('o botão interno quebra entre linhas', () => {
    // `<button>` é inline-block por padrão, e inline-block NÃO quebra. Cada
    // sentença tem dezenas de palavras: sem `display: inline` uma única frase
    // estouraria a largura da folha.
    const css = readFileSync('src/app/globals.css', 'utf8');
    const bloco = /\.sentence\s*\{([^}]*)\}/u.exec(css);
    expect(bloco?.[1]).toContain('display: inline');
  });

  it('`unanalyzed` e `excluded` não renderizam idênticos', () => {
    // São ausências semanticamente diferentes: uma é "não coube no limite",
    // a outra é "não é analisável". Parecer a mesma coisa atribui à primeira
    // uma razão falsa — o leitor conclui que o sistema julgou, quando ele nem
    // olhou.
    //
    // O canal aqui é FUNDO, e não traço, porque solid/dashed/dotted já
    // pertencem às três categorias e reusá-los criaria colisão visual.
    const foraDoLimite = backgroundOf('unanalyzed');
    const naoAnalisavel = backgroundOf('excluded');

    expect(foraDoLimite).not.toBe(naoAnalisavel);
    expect(foraDoLimite).not.toBe('');
  });
});

/**
 * Cor NUNCA é o único canal (`design-visual-2.md` § 3.5).
 *
 * Cada categoria tem traço próprio no sublinhado, distinguível em escala de
 * cinza, em qualquer deficiência de visão de cor e em impressão preto e
 * branco.
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
      expect(styleOf(`mark-${categoria}`).borderBottomWidth, categoria).toBe(
        '2px',
      );
    }
  });

  it('a amostra da legenda usa o MESMO traço do texto', () => {
    // A legenda prometendo um código que o texto não entrega foi exatamente
    // o sintoma que tornou o bug anterior enganoso. A amostra desenha o traço
    // em `border-top` (é uma linha de 24px, sem conteúdo), e o texto em
    // `border-bottom` — o que precisa coincidir é o ESTILO.
    for (const categoria of CATEGORIES) {
      expect(
        styleOf(`stroke-${categoria}`).borderTopStyle,
        categoria,
      ).toBe(styleOf(`mark-${categoria}`).borderBottomStyle);
    }
  });
});
