import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { EN_SIGNALS } from '../../src/adapters/classify/signals/en.js';
import { PT_BR_SIGNALS } from '../../src/adapters/classify/signals/pt-br.js';
import { ALL_SIGNAL_KINDS } from '../../src/adapters/classify/signals/types.js';

/**
 * A página de metodologia não pode divergir do código.
 *
 * Ela existe porque a ADR-004 item 4 exige a metodologia a um clique do
 * resultado, nomeando três coisas: quais sinais, como o score é calculado, o
 * que não foi medido.
 *
 * O risco óbvio de uma página assim é envelhecer em silêncio — alguém muda um
 * peso, e a página segue anunciando o antigo. E aqui isso seria pior que em
 * qualquer outro lugar, porque ela é justamente a fonte de verdade sobre o
 * método. Este arquivo garante que os valores venham de `import`, e que
 * nenhum tipo de sinal fique de fora.
 */

const FONTE = readFileSync('src/app/metodologia/page.tsx', 'utf8');

describe('A página lê do código, não repete à mão', () => {
  it.each([
    ['os pesos', 'WEIGHTS'],
    ['a versão do score', 'SCORE_VERSION'],
    ['o piso de sentenças', 'MIN_ANALYZABLE_SENTENCES'],
    ['o limiar da guarda', 'MIN_ANALYZABLE_RATIO'],
    ['a ressalva do domínio', 'DISCLAIMER_PT_BR'],
    ['as mensagens de sem-medida', 'UNSCORED_MESSAGE'],
    ['a tabela de sinais pt-BR', 'PT_BR_SIGNALS'],
    ['a tabela de sinais en', 'EN_SIGNALS'],
  ])('importa %s', (_rotulo, simbolo) => {
    expect(FONTE).toContain(simbolo);
  });

  it('NÃO tem os pesos escritos como número solto', () => {
    // Se alguém trocar `{WEIGHTS.factualDensity}` por `0.6` digitado, a página
    // passa a poder mentir. É o modo de falha mais provável, porque digitar é
    // mais rápido que importar.
    const semComentarios = FONTE.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gmu, '');
    expect(semComentarios).not.toMatch(/[^.\w]0\.6[^\d]/u);
    expect(semComentarios).not.toMatch(/[^.\w]0\.4[^\d]/u);
  });

  it('RENDERIZA a ressalva vinda do domínio', () => {
    /*
     * Asserção POSITIVA, e a diferença importa.
     *
     * A primeira versão checava a ausência de uma frase específica — e uma
     * sabotagem passou por ela só por escrever a mesma coisa sem um acento.
     * Procurar a ausência de um texto é uma corrida contra paráfrases; exigir
     * a PRESENÇA da expressão que interpola a constante é uma condição só.
     */
    expect(FONTE).toMatch(/\{DISCLAIMER_PT_BR\}/u);
  });
});

describe('Nenhum tipo de sinal fica de fora', () => {
  /*
   * A página agrupa os sinais em quatro blocos. Se alguém acrescentar um tipo
   * novo em `types.ts` e esquecer de listá-lo aqui, ele existe no motor e
   * some da explicação — e a página passa a descrever um sistema que não é
   * o que roda.
   */
  it.each(ALL_SIGNAL_KINDS)('o tipo %s aparece na página', (kind) => {
    expect(FONTE).toContain(kind);
  });

  it('todo sinal das tabelas tem um dos tipos agrupados', () => {
    // O outro lado da mesma garantia: um sinal cujo tipo não esteja em nenhum
    // grupo seria detectado pelo motor e nunca exibido.
    for (const tabela of [PT_BR_SIGNALS, EN_SIGNALS]) {
      for (const sinal of tabela.signals) {
        expect(ALL_SIGNAL_KINDS, `${tabela.language}: ${sinal.name}`).toContain(sinal.kind);
      }
    }
  });
});
