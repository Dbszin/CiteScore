import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Contraste WCAG, CALCULADO por COMPOSIÇÃO DE CAMADAS.
 *
 * Histórico deste arquivo, e ele justifica cada linha:
 *
 * 1. A primeira spec de design afirmava 7,1 / 6,4 / 6,8 para as três
 *    categorias. Os valores reais eram 5,97 / 6,60 / 4,86. Ninguém calculou.
 * 2. Quando este teste passou a existir, achou de imediato DUAS reprovações
 *    que a conferência manual não tinha visto.
 * 3. Na pele "Precisão Escura" achou mais uma antes de uma linha de CSS ser
 *    escrita: `--text-faint` em 48% reprovava nos cinco fundos.
 * 4. Na pele "Malha e Camadas" achou a quarta: `--text-faint` em 58% dava
 *    4,39:1 sobre o fundo composto.
 *
 * ⚠️ O QUE MUDOU NESTA PELE, e é a razão de o arquivo ter ficado mais complexo.
 *
 * Os painéis são TRANSLÚCIDOS e o fundo sob eles VARIA: há o vazio, um halo
 * radial e uma malha de linhas. A pergunta "qual é o fundo?" deixou de ter
 * resposta única, então comparar tinta com token de fundo não significa mais
 * nada.
 *
 * A solução é compor as camadas com o mesmo modelo do navegador —
 * `out = a*fg + (1-a)*bg` em sRGB gama-codificado — e testar o PIOR CASO: o
 * fundo mais claro que pode existir sob o texto, porque é o que menos
 * contrasta com texto claro. Esse pior caso é vazio + halo no pico + linha da
 * malha.
 *
 * Resultado interessante da composição, e ele é contra-intuitivo: painel
 * translúcido ESCURO sobre o halo ABAIXA a luminância local. Texto sobre
 * painel é mais fácil que texto direto sobre o fundo com halo. O caso difícil
 * é o hero, onde o texto pousa no fundo nu.
 */

const CSS = readFileSync('src/app/globals.css', 'utf8');

/** Sem comentários: eles citam seletores e valores ao explicá-los. */
const semComentarios = CSS.replace(/\/\*[\s\S]*?\*\//gu, '');

/** Limiar AA para corpo. */
const AA_CORPO = 4.5;
/** WCAG 1.4.11 — componente de interface e objeto gráfico. */
const AA_COMPONENTE = 3;
/** WCAG 1.4.3 — texto grande (>=24px, ou >=18.66px em negrito). */
const AA_TEXTO_GRANDE = 3;

type Rgb = readonly [number, number, number];
interface Cor {
  readonly rgb: Rgb;
  readonly alpha: number;
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  const sN = s / 100;
  const lN = l / 100;
  const c = (1 - Math.abs(2 * lN - 1)) * sN;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lN - c / 2;
  const base: Rgb =
    h < 60 ? [c, x, 0]
    : h < 120 ? [x, c, 0]
    : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c]
    : h < 300 ? [x, 0, c]
    : [c, 0, x];
  return [(base[0] + m) * 255, (base[1] + m) * 255, (base[2] + m) * 255];
}

/**
 * Compõe `frente` sobre `fundo`, como o navegador: mistura linear dos valores
 * sRGB gama-codificados. NÃO é interpolação em espaço linear — o navegador
 * também não faz isso para `background` normal, e o objetivo aqui é reproduzir
 * o que a tela mostra, não o que seria colorimetricamente mais correto.
 */
function sobre(frente: Cor, fundo: Rgb): Rgb {
  const a = frente.alpha;
  return [
    a * frente.rgb[0] + (1 - a) * fundo[0],
    a * frente.rgb[1] + (1 - a) * fundo[1],
    a * frente.rgb[2] + (1 - a) * fundo[2],
  ];
}

function luminancia(rgb: Rgb): number {
  const canal = (v: number): number => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(rgb[0]) + 0.7152 * canal(rgb[1]) + 0.0722 * canal(rgb[2]);
}

function contraste(a: Rgb, b: Rgb): number {
  const la = luminancia(a);
  const lb = luminancia(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Todas as declarações de um token no CSS, com alpha.
 *
 * Devolve TODAS e não a primeira de propósito: `--panel` é declarado duas
 * vezes — translúcido no `:root` e opaco dentro de
 * `@media (prefers-reduced-transparency: reduce)`. As duas pintam texto de
 * verdade, então as duas precisam passar. Se alguém clarear só a variante
 * opaca, a reprovação apareceria aqui em vez de passar silenciosa.
 */
function tokens(nome: string): readonly Cor[] {
  const achados = [
    ...semComentarios.matchAll(
      new RegExp(
        String.raw`--${nome}:\s*hsl\((\d+)\s+(\d+)%\s+(\d+)%(?:\s*/\s*([\d.]+))?\)`,
        'gu',
      ),
    ),
  ];
  if (achados.length === 0) throw new Error(`token --${nome} não encontrado`);
  return achados.map((m) => ({
    rgb: hslToRgb(Number(m[1]), Number(m[2]), Number(m[3])),
    alpha: m[4] === undefined ? 1 : Number(m[4]),
  }));
}

/** A primeira declaração de um token, com alpha. */
function primeira(nome: string): Cor {
  const achado = tokens(nome)[0];
  if (achado === undefined) throw new Error(`token --${nome} vazio`);
  return achado;
}

/** A primeira declaração — para tokens que só existem uma vez (as tintas). */
function tinta(nome: string): Rgb {
  return primeira(nome).rgb;
}

// ---------------------------------------------------------------------------
// As camadas de fundo, compostas de baixo para cima.
// ---------------------------------------------------------------------------

const VOID = tinta('void');
const FUNDO_HALO = sobre(primeira('halo'), VOID);
/** O fundo mais claro que pode existir sob texto: halo no pico + linha da malha. */
const FUNDO_PIOR = sobre(primeira('mesh'), FUNDO_HALO);

/**
 * Cada superfície, composta sobre o pior fundo. Uma entrada por DECLARAÇÃO do
 * token, então a variante opaca de `prefers-reduced-transparency` também entra.
 */
function superficies(): readonly (readonly [string, Rgb])[] {
  const lista: (readonly [string, Rgb])[] = [
    ['fundo nu (halo + malha)', FUNDO_PIOR],
  ];
  for (const nome of ['panel', 'panel-inset', 'panel-raised'] as const) {
    tokens(nome).forEach((cor, indice) => {
      const rotulo = cor.alpha === 1 ? `${nome} (opaco)` : `${nome} (a=${cor.alpha})`;
      lista.push([`${rotulo}#${indice}`, sobre(cor, FUNDO_PIOR)]);
    });
  }
  return lista;
}

const SUPERFICIES = superficies();

/** Tintas que pintam texto de CORPO em qualquer superfície da interface. */
const CORPO = ['text-bright', 'text-body', 'text-dim', 'text-faint', 'accent', 'warn', 'fail'] as const;

/** Componentes: identificam controle, limiar 3:1 pela 1.4.11. */
const COMPONENTE = ['line-field', 'focus'] as const;

describe('Contraste — corpo sobre superfície composta (AA 4,5:1)', () => {
  for (const nome of CORPO) {
    it.each(SUPERFICIES)(`--${nome} sobre %s`, (rotulo, fundo) => {
      const razao = contraste(tinta(nome), fundo);
      expect(
        Number(razao.toFixed(2)),
        `--${nome} sobre ${rotulo}: ${razao.toFixed(2)}:1, mínimo ${AA_CORPO}:1`,
      ).toBeGreaterThanOrEqual(AA_CORPO);
    });
  }
});

describe('Contraste — componente de interface (WCAG 1.4.11, 3:1)', () => {
  for (const nome of COMPONENTE) {
    it.each(SUPERFICIES)(`--${nome} sobre %s`, (rotulo, fundo) => {
      const razao = contraste(tinta(nome), fundo);
      expect(
        Number(razao.toFixed(2)),
        `--${nome} sobre ${rotulo}: ${razao.toFixed(2)}:1, mínimo ${AA_COMPONENTE}:1`,
      ).toBeGreaterThanOrEqual(AA_COMPONENTE);
    });
  }
});

describe('Contraste — a headline em gradiente', () => {
  /*
   * A headline é pintada por gradiente com `background-clip: text`. O ponto
   * MAIS ESCURO do gradiente é o pior caso, e é ele que precisa passar — medir
   * a média ou o ponto claro seria medir o que não reprova.
   *
   * Limiar 3:1 porque ela vai de 44px a 72px e cai em "texto grande" pela
   * WCAG 1.4.3. É a única concessão de limiar em todo o arquivo, e vale
   * porque o tamanho está travado no `clamp` do CSS, não no julgamento de
   * ninguém.
   */
  it.each(SUPERFICIES)('--display-to (ponto escuro) sobre %s', (rotulo, fundo) => {
    const razao = contraste(tinta('display-to'), fundo);
    expect(
      Number(razao.toFixed(2)),
      `--display-to sobre ${rotulo}: ${razao.toFixed(2)}:1, mínimo ${AA_TEXTO_GRANDE}:1`,
    ).toBeGreaterThanOrEqual(AA_TEXTO_GRANDE);
  });

  it('a headline tem `color` sólido declarado como fallback', () => {
    // Sem isso, navegador sem `background-clip: text` mostra texto INVISÍVEL —
    // o modo de falha clássico desta técnica.
    const bloco = /\.display-1\s*\{([^}]*)\}/u.exec(semComentarios);
    expect(bloco).not.toBeNull();
    expect(bloco?.[1]).toMatch(/\n\s*color:\s*var\(--text-bright\)/u);
  });
});

/** A folha é opaca: aqui a composição não se aplica e a conta é direta. */
const FOLHA: readonly (readonly [string, string])[] = [
  ['sheet-ink', 'sheet'],
  ['sheet-dim', 'sheet'],
  ['cat-sourced', 'cat-sourced-bg'],
  ['cat-unsourced', 'cat-unsourced-bg'],
  ['cat-opinion', 'cat-opinion-bg'],
  ['cat-sourced', 'sheet'],
  ['cat-unsourced', 'sheet'],
  ['cat-opinion', 'sheet'],
];

describe('Contraste — a folha clara (AA 4,5:1)', () => {
  it.each(FOLHA)('--%s sobre --%s', (frente, fundo) => {
    const razao = contraste(tinta(frente), tinta(fundo));
    expect(
      Number(razao.toFixed(2)),
      `--${frente} sobre --${fundo}: ${razao.toFixed(2)}:1, mínimo ${AA_CORPO}:1`,
    ).toBeGreaterThanOrEqual(AA_CORPO);
  });
});

describe('Os painéis leem como superfície', () => {
  /*
   * ⚠️ ESTE LIMIAR NÃO É WCAG. É piso de DESENHO, e a distinção importa.
   *
   * Existe porque uma sabotagem revelou um vão: baixar o alpha do painel de
   * 0,66 para 0,15 NÃO reprova em contraste algum, e não deveria — o fundo
   * efetivo converge para o fundo nu, que já é testado e passa. A
   * acessibilidade fica intacta.
   *
   * O que quebra é outra coisa: o painel deixa de existir visualmente. Some a
   * superfície, e a tela volta a ser texto solto no vazio — que é exatamente o
   * defeito que esta pele foi feita para corrigir.
   *
   * O piso de 1,05 vem de medição, não de norma: alpha 0,15 no painel daria
   * cerca de 1,03, e os valores atuais ficam acima de 1,05. Não é garantia
   * perceptual de nada — é uma cerca contra a superfície desaparecer, e é
   * deliberadamente frouxa porque camada sobre camada em tema escuro trabalha
   * com diferenças pequenas por natureza.
   */
  const PISO_DE_SUPERFICIE = 1.05;

  /*
   * O ANINHAMENTO REAL importa, e a primeira versão deste teste errou nisso.
   *
   * `--panel-raised` nunca pousa no fundo nu: ele pinta `.reading-cell` e
   * `.warn`, que vivem DENTRO de `.panel`. Comparar com o fundo nu media a
   * superfície errada e reprovava por 1,058 um contraste que na tela não
   * existe. Cada superfície é comparada com o pai em que ela de fato assenta.
   */
  const PAI: Record<string, () => Rgb> = {
    panel: () => FUNDO_PIOR,
    'panel-inset': () => sobre(primeira('panel'), FUNDO_PIOR),
    'panel-raised': () => sobre(primeira('panel'), FUNDO_PIOR),
  };

  it.each(['panel', 'panel-inset', 'panel-raised'] as const)(
    '--%s se distingue da superfície em que assenta',
    (nome) => {
      const pai = PAI[nome];
      if (pai === undefined) throw new Error(`pai de --${nome} não declarado`);
      const fundo = pai();
      for (const cor of tokens(nome)) {
        const razao = contraste(sobre(cor, fundo), fundo);
        expect(
          Number(razao.toFixed(3)),
          `--${nome} (a=${cor.alpha}) difere do pai por ${razao.toFixed(3)}:1, ` +
            `piso ${PISO_DE_SUPERFICIE} — abaixo disso a superfície some`,
        ).toBeGreaterThanOrEqual(PISO_DE_SUPERFICIE);
      }
    },
  );
});

describe('A paleta é única', () => {
  it('não há REGRA de tema claro', () => {
    // Se alguém reintroduzir um tema claro, os pares acima deixam de cobrir
    // metade da aplicação SEM falhar — a reprovação viraria silenciosa.
    //
    // Os comentários saem antes da checagem, e isso não é detalhe: a primeira
    // versão deste teste reprovou contra o comentário do próprio CSS que
    // EXPLICA que o tema claro não existe. Substring crua confunde a menção
    // com a coisa.
    expect(semComentarios).not.toContain('prefers-color-scheme: light');
    expect(semComentarios).toContain('color-scheme: dark');
  });

  it('a variante de transparência reduzida existe', () => {
    // Ela é o caminho de quem não consegue ler sobre fundo movimentado. Se
    // desaparecer num refactor, os painéis translúcidos ficam sem alternativa
    // e ninguém percebe.
    expect(semComentarios).toContain('prefers-reduced-transparency: reduce');
  });
});

/*
 * O que este arquivo NÃO testa, e por quê:
 *
 * 1. **`--line` e `--line-bright`.** Divisores DECORATIVOS, e a WCAG 1.4.11 os
 *    isenta: não carregam informação e não identificam componente. Ficam em
 *    torno de 1,3-1,9:1 e isso está certo — hairline de separação a 3:1 num
 *    tema escuro viraria uma grade. Uma versão anterior da spec listou
 *    `line-bright` com limiar 3,0, e o LIMIAR estava errado, não a cor. O que
 *    de fato precisava de 3:1 era a borda de COMPONENTE, e ela ganhou token
 *    próprio (`--line-field`), calculado, testado acima.
 *
 * 2. **`--sheet-edge` contra `--sheet`.** Mesma razão: divisor interno da
 *    folha. O que faz a folha ser identificável é ela contra o fundo escuro,
 *    e isso mede ~18:1.
 *
 * 3. **O `backdrop-filter: blur()`.** Ele só REDISTRIBUI a luminância do que
 *    está atrás, então não pode criar um pixel mais claro que o mais claro
 *    presente. Como o pior caso já usa o pico do halo somado à linha da malha,
 *    o blur está coberto por construção — desfocar não estoura o limite
 *    superior.
 *
 * 4. **Distinguibilidade entre as três tintas.** Foi escrito uma vez, mediu
 *    1,15 / 1,21 / 1,38, e a conclusão certa não era afrouxar o limiar — era
 *    apagar o teste. O contraste WCAG mede diferença de LUMINÂNCIA, e as três
 *    tintas têm luminância parecida DE PROPÓSITO: são três lápis de revisor de
 *    peso igual, não uma escala. Distinção por matiz não se mede assim, e o
 *    canal que de fato garante a distinção — solid/dashed/dotted — tem teste
 *    próprio em `highlight-cascade.test.ts`.
 */
