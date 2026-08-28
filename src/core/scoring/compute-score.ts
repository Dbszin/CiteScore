import type { ScoreBreakdown, ScoreOutcome } from '../domain/analysis.js';
import type { Classification } from '../domain/classification.js';
import { countByCategory, countDecidedBy } from '../domain/classification.js';
import {
  MIN_ANALYZABLE_SENTENCES,
  WEIGHTS,
} from './weights.js';

export interface ScoreResult {
  readonly outcome: ScoreOutcome;
  readonly breakdown: ScoreBreakdown;
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

/**
 * Função pura: sem I/O, sem relógio, sem aleatoriedade.
 *
 * ADR-003:
 *   FD  = sourced / N
 *   GAP = unsourced / (sourced + unsourced)
 *   CiteScore = round(100 * (0.6 * FD + 0.4 * (1 - GAP)))
 *
 * `FD` recompensa produzir afirmação sustentada. `1 - GAP` recompensa não
 * deixar afirmação pendurada — é a métrica acionável, a única que o usuário
 * move sem reescrever o artigo inteiro: basta adicionar fonte ao que afirmou.
 *
 * Opinião entra apenas DILUINDO `FD`, nunca penalizando. Um artigo
 * declaradamente editorial pontua baixo em `FD` sem ser tratado como
 * defeituoso.
 */
export function computeScore(
  classifications: readonly Classification[],
  analyzableCount: number,
): ScoreResult {
  const counts = countByCategory(classifications);
  const { SOURCED: sourced, UNSOURCED: unsourced, OPINION: opinion } = counts;
  const claims = sourced + unsourced;

  const total = classifications.length;
  const llmEscalationRate =
    total === 0 ? 0 : round4(countDecidedBy(classifications, 'llm') / total);

  const factualDensity = analyzableCount === 0 ? 0 : round4(sourced / analyzableCount);
  const gapRate = claims === 0 ? null : round4(unsourced / claims);

  const breakdown: ScoreBreakdown = {
    analyzableSentences: analyzableCount,
    sourced,
    unsourced,
    opinion,
    factualDensity,
    gapRate,
    llmEscalationRate,
  };

  // ==== ÚLTIMA BARREIRA DE CONSISTÊNCIA ====
  //
  // Toda a aritmética abaixo pressupõe que cada sentença analisável tenha no
  // máximo UMA classificação. Se o pipeline entregar mais — e ele entrega,
  // quando o modelo repete um id na resposta —, o pressuposto quebra e o
  // resultado deixa de ter significado: densidade factual de 150% e score
  // 130 numa escala de 0 a 100 foram medidos antes desta guarda existir.
  //
  // A checagem fica aqui, e não só na origem, de propósito: esta função é a
  // única que protege independentemente de qual camada acima tenha errado.
  // Preferimos recusar a medida a publicar um número sem sentido.
  //
  // Menos classificações que N é aceitável: o pipeline pode legitimamente
  // entregar menos. Mais, nunca.
  if (sourced + unsourced + opinion > analyzableCount) {
    return {
      outcome: { kind: 'unscored', reason: 'INCONSISTENT_INPUT' },
      breakdown,
    };
  }

  // Texto curto: não há medida a dar. Não é score zero — é ausência de score.
  if (analyzableCount < MIN_ANALYZABLE_SENTENCES) {
    return {
      outcome: { kind: 'unscored', reason: 'INSUFFICIENT_CONTENT' },
      breakdown,
    };
  }

  // Nenhuma afirmação: GAP é indefinido. Calcular `1 - GAP = 1` daria bônus
  // máximo justo a quem não afirmou nada — o oposto do que a métrica significa.
  if (claims === 0) {
    return {
      outcome: { kind: 'unscored', reason: 'NO_CLAIMS_FOUND' },
      breakdown,
    };
  }

  const gapComplement = 1 - (gapRate ?? 0);
  const raw =
    WEIGHTS.factualDensity * factualDensity +
    WEIGHTS.gapComplement * gapComplement;

  return {
    outcome: { kind: 'scored', score: Math.round(100 * raw) },
    breakdown,
  };
}
