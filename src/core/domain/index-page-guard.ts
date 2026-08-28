import {
  MIN_ANALYZABLE_RATIO,
  MIN_SENTENCES_FOR_RATIO,
} from '../scoring/weights.js';
import { countAnalyzable } from './sentence.js';
import type { Sentence } from './sentence.js';

/**
 * ==== CORREÇÃO 2 DO BENCHMARK ====
 *
 * Home de portal produz LIXO PLAUSÍVEL, não erro — que é pior, porque passa.
 * A home da Folha atravessou a extração com 331 palavras que são manchetes
 * soltas, e emitiria um score sem sentido.
 *
 * O critério abaixo saiu de medição sobre os 7 fixtures reais, não de chute.
 * A coluna decisiva é a razão de sentenças analisáveis sobre o total:
 *
 *   página                       tipo            ratio   links/palavra
 *   ---------------------------------------------------------------
 *   MDN (doc técnico)            artigo          0.667   0.023
 *   Moz (pilar SEO)              artigo          0.554   0.025
 *   Ahrefs (blog SEO)            artigo          0.545   0.014
 *   Wikipedia (lista de PIB)     conteúdo        0.431   0.316
 *   Next.js /blog                ÍNDICE          0.276   0.089
 *   Folha (home)                 ÍNDICE          0.087   0.172
 *   G1 (home)                    já barrada na extração (38 palavras)
 *
 * Limiar em 0.35: separa com folga confortável (0.276 flagrado, 0.431 não).
 *
 * ACHADO IMPORTANTE — `links/palavra` NÃO serve como sinal, ao contrário do
 * que a intuição sugere: a Wikipedia (conteúdo legítimo) tem a MAIOR densidade
 * de links de todo o corpus, 0.316, quase o dobro da home da Folha, 0.172.
 * Usar links por palavra produziria falso positivo justamente nas páginas
 * mais densas em fonte — o oposto do que o produto quer. Sinal descartado
 * com base na medição.
 */

// O limiar e o piso vivem em `scoring/weights.ts`, sob o mesmo regime de
// versionamento dos pesos do score: mudá-los muda QUAIS páginas recebem
// score, então exige incrementar SCORE_VERSION. Reexportados aqui por
// conveniência de quem consome a guarda.
export { MIN_ANALYZABLE_RATIO, MIN_SENTENCES_FOR_RATIO };

export interface IndexPageAssessment {
  readonly isIndexPage: boolean;
  readonly totalSentences: number;
  readonly analyzableSentences: number;
  readonly analyzableRatio: number;
}

/** Função pura: sem I/O, sem relógio, sem aleatoriedade. */
export function assessIndexPage(
  sentences: readonly Sentence[],
): IndexPageAssessment {
  const totalSentences = sentences.length;
  // Reutiliza a contagem do domínio em vez de reimplementá-la aqui.
  const analyzableSentences = countAnalyzable(sentences);

  const analyzableRatio =
    totalSentences === 0 ? 0 : analyzableSentences / totalSentences;

  const isIndexPage =
    totalSentences >= MIN_SENTENCES_FOR_RATIO &&
    analyzableRatio < MIN_ANALYZABLE_RATIO;

  return { isIndexPage, totalSentences, analyzableSentences, analyzableRatio };
}
