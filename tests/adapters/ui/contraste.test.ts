import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Contraste WCAG, calculado a partir dos tokens reais.
 *
 * Existe porque "contraste verificado" escrito à mão não vale nada: a spec de
 * design afirmava 7,1 / 6,4 / 6,8 para as três categorias, e os valores reais
 * eram 5,97 / 6,60 / 4,86. Ninguém tinha calculado.
 *
 * Pior: `--text-muted` estava em 3,49:1 contra o fundo da ficha técnica —
 * reprovado em AA para o texto de 12px que ele pinta.
 *
 * O cálculo é determinístico e barato. Não há razão para ser opinião.
 */

const CSS = readFileSync('src/app/globals.css', 'utf8');

/** Limiar AA para corpo. Texto grande (≥24px) poderia usar 3:1; não usamos. */
const AA_CORPO = 4.5;

type Rgb = readonly [number, number, number];

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
 * Lê o token do CSS real. Se alguém mudar a cor e esquecer o contraste, é
 * aqui que o esquecimento aparece.
 */
function token(nome: string, tema: 'claro' | 'escuro'): Rgb {
  // O bloco escuro vive dentro do `@media (prefers-color-scheme: dark)`.
  const inicioEscuro = CSS.indexOf('@media (prefers-color-scheme: dark)');
  const trecho =
    tema === 'claro' ? CSS.slice(0, inicioEscuro) : CSS.slice(inicioEscuro);

  const achado = new RegExp(
    String.raw`--${nome}:\s*hsl\((\d+)\s+(\d+)%\s+(\d+)%\)`,
    'u',
  ).exec(trecho);

  if (achado === null) {
    throw new Error(`token --${nome} não encontrado no tema ${tema}`);
  }
  return hslToRgb(Number(achado[1]), Number(achado[2]), Number(achado[3]));
}

/** [texto, fundo, descrição] — todos em tamanho de CORPO. */
const PARES: readonly (readonly [string, string, string])[] = [
  ['text-primary', 'bg-primary', 'corpo sobre a página'],
  ['text-primary', 'bg-surface', 'corpo sobre cartão'],
  ['text-secondary', 'bg-primary', 'apoio sobre a página'],
  ['text-secondary', 'bg-surface', 'apoio sobre cartão'],
  // Este é o que reprovava: pinta a ficha técnica (12px) e as sentenças fora
  // da análise (17px serif — ainda corpo, o limiar grande é 24px).
  ['text-muted', 'bg-sunken', 'discreto sobre a ficha técnica'],
  ['text-muted', 'bg-primary', 'discreto sobre a página'],
  ['text-muted', 'bg-surface', 'discreto sobre o manuscrito'],
  ['cat-sourced', 'cat-sourced-bg', 'categoria com dado ou fonte'],
  ['cat-unsourced', 'cat-unsourced-bg', 'categoria sem fonte'],
  ['cat-opinion', 'cat-opinion-bg', 'categoria opinião'],
];

describe.each(['claro', 'escuro'] as const)('Contraste — tema %s', (tema) => {
  it.each(PARES)('%s sobre %s (%s) atinge AA', (frente, fundo, descricao) => {
    const razao = contraste(token(frente, tema), token(fundo, tema));

    expect(
      Number(razao.toFixed(2)),
      `${descricao}: ${razao.toFixed(2)}:1, mínimo ${AA_CORPO}:1`,
    ).toBeGreaterThanOrEqual(AA_CORPO);
  });
});

/*
 * NÃO existe aqui um teste de "as três tintas são distinguíveis entre si".
 *
 * Foi escrito, mediu 1,15 / 1,21 / 1,38 entre os pares, e a conclusão certa
 * não era afrouxar o limiar — era apagar o teste. O contraste WCAG mede
 * diferença de LUMINÂNCIA, e as três tintas têm luminância parecida DE
 * PROPÓSITO: são três lápis de revisor de peso igual, não uma escala. Forçar
 * separação de luminância entre elas desequilibraria a hierarquia que o
 * design escolheu.
 *
 * Distinção por matiz não se mede assim. E o canal que de fato garante a
 * distinção — o traço cheio/tracejado/pontilhado — tem teste próprio em
 * `highlight-cascade.test.ts`.
 */
