import type { Analysis, UnscoredReason } from '../core/domain/analysis.js';
import type { ClaimCategory } from '../core/domain/classification.js';
import type { ExclusionReason, SentenceId } from '../core/domain/sentence.js';

/**
 * Decide o que cada resultado PERMITE exibir, antes de qualquer JSX.
 *
 * É um arquivo `.ts` sem React de propósito: a decisão fica testável sem
 * ambiente de DOM, e o teste sobrevive ao redesign do M3 — ele trava a regra,
 * não a marcação.
 */

export const CATEGORY_LABEL: Record<ClaimCategory, string> = {
  SOURCED: 'Com dado ou fonte',
  UNSOURCED: 'Sem fonte',
  OPINION: 'Opinião',
};

export const UNSCORED_MESSAGE: Record<UnscoredReason, string> = {
  INSUFFICIENT_CONTENT:
    'O texto tem poucas sentenças analisáveis para que um score signifique ' +
    'alguma coisa. Uma proporção medida sobre meia dúzia de frases varia ' +
    'demais para ser útil.',
  NO_CLAIMS_FOUND:
    'Nenhuma afirmação verificável foi encontrada. O texto pode ser ' +
    'inteiramente opinativo, narrativo ou promocional — nesse caso não há o ' +
    'que medir, e não é o mesmo que medir zero.',
  INCONSISTENT_INPUT:
    'A classificação devolveu dados inconsistentes e o score foi suprimido. ' +
    'Publicar um número derivado daqui seria pior que não publicar nenhum.',
};

const EXCLUSION_LABEL: Record<ExclusionReason, string> = {
  heading: 'título',
  short: 'trecho curto',
  no_verb: 'fragmento sem verbo',
  list_item: 'item de lista',
};

export interface BreakdownRow {
  readonly category: ClaimCategory;
  readonly label: string;
  readonly count: number;
  /** Percentual já formatado, ou `—` quando não há denominador. */
  readonly percent: string;
}

/**
 * O painel do score.
 *
 * A variante `scored` carrega o número E o breakdown no MESMO objeto: não
 * existe estado representável em que um apareça sem o outro. A ADR-004 passa
 * a ser garantida pelo tipo, e não por dois condicionais que alguém precisa
 * lembrar de manter em sincronia.
 *
 * A variante `unscored` não tem campo numérico algum — métrica derivada não
 * tem como vazar para uma tela sem score, porque não existe nela.
 */
export type ScorePanel =
  | {
      readonly kind: 'scored';
      readonly score: number;
      readonly scoreVersion: string;
      readonly breakdown: readonly BreakdownRow[];
    }
  | {
      readonly kind: 'unscored';
      readonly reason: UnscoredReason;
      readonly message: string;
    };

export function buildScorePanel(analysis: Analysis): ScorePanel {
  if (analysis.outcome.kind === 'unscored') {
    return {
      kind: 'unscored',
      reason: analysis.outcome.reason,
      message: UNSCORED_MESSAGE[analysis.outcome.reason],
    };
  }

  const { breakdown } = analysis;
  const total = breakdown.analyzableSentences;

  return {
    kind: 'scored',
    score: analysis.outcome.score,
    scoreVersion: analysis.scoreVersion,
    breakdown: [
      row('SOURCED', breakdown.sourced, total),
      row('UNSOURCED', breakdown.unsourced, total),
      row('OPINION', breakdown.opinion, total),
    ],
  };
}

function row(
  category: ClaimCategory,
  count: number,
  total: number,
): BreakdownRow {
  return {
    category,
    label: CATEGORY_LABEL[category],
    count,
    percent: total === 0 ? '—' : `${Math.round((count / total) * 100)}%`,
  };
}

/**
 * Um trecho do texto, com o motivo pelo qual está do jeito que está.
 *
 * `unanalyzed` existe porque havia duas ausências diferentes renderizando
 * idênticas: a sentença que o segmentador descartou (título, lista,
 * fragmento) e a sentença analisável que ficou de fora do cap de truncagem.
 * Pintar as duas de cinza sob a legenda "fora da análise" atribuía à segunda
 * uma razão falsa — e honestidade sobre o que foi medido é o contrato deste
 * produto (ADR-004), não um detalhe de apresentação.
 */
export type Segment =
  | {
      readonly kind: 'classified';
      readonly id: SentenceId;
      readonly text: string;
      readonly category: ClaimCategory;
      readonly label: string;
    }
  | {
      readonly kind: 'unanalyzed';
      readonly id: SentenceId;
      readonly text: string;
      readonly label: string;
    }
  | {
      readonly kind: 'excluded';
      readonly id: SentenceId;
      readonly text: string;
      readonly label: string;
    };

export function buildSegments(analysis: Analysis): readonly Segment[] {
  const byId = new Map(
    analysis.classifications.map((item) => [item.sentenceId, item.category]),
  );

  return analysis.sentences.map((sentence): Segment => {
    const category = byId.get(sentence.id);
    if (category !== undefined) {
      return {
        kind: 'classified',
        id: sentence.id,
        text: sentence.text,
        category,
        label: CATEGORY_LABEL[category],
      };
    }

    if (sentence.analyzable) {
      return {
        kind: 'unanalyzed',
        id: sentence.id,
        text: sentence.text,
        label: 'Analisável, mas fora do limite de análise',
      };
    }

    const reason = sentence.excludedReason;
    return {
      kind: 'excluded',
      id: sentence.id,
      text: sentence.text,
      label:
        reason === undefined
          ? 'Fora da análise'
          : `Fora da análise: ${EXCLUSION_LABEL[reason]}`,
    };
  });
}

/**
 * A legenda descreve apenas o que a tela de fato contém.
 *
 * Anunciar uma categoria ausente convida o leitor a procurar no texto uma
 * cor que não está lá.
 */
export interface LegendEntry {
  readonly key: string;
  readonly className: string;
  readonly label: string;
}

export function buildLegend(segments: readonly Segment[]): readonly LegendEntry[] {
  const entries: LegendEntry[] = [];
  const kinds = new Set(segments.map((segment) => segment.kind));
  const categories = new Set(
    segments.flatMap((segment) =>
      segment.kind === 'classified' ? [segment.category] : [],
    ),
  );

  for (const category of ['SOURCED', 'UNSOURCED', 'OPINION'] as const) {
    if (categories.has(category)) {
      entries.push({
        key: category,
        className: `cat-${category}`,
        label: CATEGORY_LABEL[category],
      });
    }
  }
  if (kinds.has('unanalyzed')) {
    entries.push({
      key: 'unanalyzed',
      className: 'unanalyzed',
      label: 'Analisável, mas fora do limite de análise',
    });
  }
  if (kinds.has('excluded')) {
    entries.push({
      key: 'excluded',
      className: 'excluded',
      label: 'Fora da análise (título, lista, fragmento)',
    });
  }
  return entries;
}
