import type { Analysis, UnscoredReason } from '../core/domain/analysis.js';
import type { ClaimCategory } from '../core/domain/classification.js';
import type { ExclusionReason, SentenceId } from '../core/domain/sentence.js';

/**
 * Decide o que cada resultado PERMITE exibir, antes de qualquer JSX.
 *
 * É um arquivo `.ts` sem React de propósito: a decisão fica testável sem
 * ambiente de DOM, e o teste trava a REGRA, não a marcação.
 */

export const CATEGORY_LABEL: Record<ClaimCategory, string> = {
  SOURCED: 'Com dado ou fonte',
  UNSOURCED: 'Sem fonte',
  OPINION: 'Opinião',
};

export const UNSCORED_MESSAGE: Record<UnscoredReason, string> = {
  INSUFFICIENT_CONTENT:
    'O texto tem poucas sentenças analisáveis para que uma proporção signifique ' +
    'alguma coisa. Medida sobre meia dúzia de frases, ela varia demais para ser útil.',
  NO_CLAIMS_FOUND:
    'Nenhuma afirmação verificável foi encontrada. O texto pode ser ' +
    'inteiramente opinativo, narrativo ou promocional — nesse caso não há o ' +
    'que medir, e isso não é o mesmo que medir zero.',
  INCONSISTENT_INPUT:
    'A classificação devolveu dados inconsistentes e a medida foi suprimida. ' +
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
  /** Fração 0..1, para a barra proporcional. */
  readonly share: number;
}

/**
 * O painel do resultado.
 *
 * A variante `scored` carrega o breakdown — a FIGURA PRINCIPAL, conforme a
 * emenda da ADR-007. O composto de 0 a 100 NÃO está aqui: ele vive na ficha
 * técnica, porque a régua é comprimida e instável, e um número em destaque
 * comunicaria precisão que a medição não tem.
 *
 * A variante `unscored` não tem campo numérico algum — métrica derivada não
 * tem como vazar para uma tela sem medida, porque não existe nela.
 */
export type ScorePanel =
  | {
      readonly kind: 'scored';
      readonly breakdown: readonly BreakdownRow[];
      /** Frase que diz, em português, o que as proporções significam. */
      readonly summary: string;
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
    breakdown: [
      row('SOURCED', breakdown.sourced, total),
      row('UNSOURCED', breakdown.unsourced, total),
      row('OPINION', breakdown.opinion, total),
    ],
    summary: summarize(breakdown.sourced, breakdown.unsourced),
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
    share: total === 0 ? 0 : count / total,
  };
}

/**
 * A leitura em uma frase.
 *
 * Fala de AFIRMAÇÕES, não do texto inteiro: opinião não é afirmação pendente,
 * e incluí-la no denominador faria a frase acusar o autor de algo que ele não
 * fez. É a mesma razão pela qual o `GAP` da ADR-003 exclui opinião.
 */
function summarize(sourced: number, unsourced: number): string {
  const claims = sourced + unsourced;
  if (claims === 0) return 'O texto não faz afirmações verificáveis.';
  if (unsourced === 0) {
    return `Todas as ${claims} afirmações do texto citam fonte.`;
  }
  return `Das ${claims} afirmações do texto, ${unsourced} não citam fonte.`;
}

/**
 * Abaixo desta razão de blocos classificados, a tela AVISA que mediu só uma
 * parte da página.
 *
 * O número sai da medição, não de gosto. Razão de analisáveis sobre o total,
 * no corpus e nas landing pages testadas:
 *
 *   MDN (doc técnico)        0,667  artigo
 *   Plausible (LP)           0,667  LP que parece artigo
 *   Moz (pilar SEO)          0,554  artigo
 *   Ahrefs (blog SEO)        0,545  artigo
 *   ─────────────────────── 0,50 ── o aviso começa aqui
 *   Resend (LP)              0,463
 *   Wikipedia (lista de PIB) 0,431  conteúdo legítimo, mas quase só lista
 *   Stripe (LP)              0,404
 *   RD Station (LP)          0,397
 *   ─────────────────────── 0,35 ── abaixo daqui a guarda RECUSA
 *
 * Os três artigos ficam acima e não são avisados. As landing pages que
 * escorregam pela guarda ficam abaixo e passam a ser. A lista da Wikipedia
 * também — e ali o aviso está CERTO: a página é conteúdo real, e ainda assim
 * foi medida em menos da metade dos blocos.
 *
 * Por que isto existe: sem o aviso, uma landing page recebe número medido em
 * 40% da página e nada na tela diz isso. É o mesmo modo de falha que motivou a
 * guarda de página-índice — "lixo plausível, não erro, que é pior porque
 * passa" — só que num degrau em que a guarda não pega.
 */
const RAZAO_MINIMA_SEM_AVISO = 0.5;

/**
 * Aviso de cobertura, ou `null` quando a página foi medida por inteiro.
 *
 * NÃO precisa de campo novo no contrato: a razão é derivável do que o payload
 * já carrega — `sentences.length` e `breakdown.analyzableSentences`.
 */
export function buildCoverageNotice(analysis: Analysis): string | null {
  const total = analysis.sentences.length;
  const classificadas = analysis.breakdown.analyzableSentences;
  if (total === 0) return null;

  const razao = classificadas / total;
  if (razao >= RAZAO_MINIMA_SEM_AVISO) return null;

  const pct = Math.round(razao * 100);
  return (
    `Classificamos ${classificadas} dos ${total} blocos de texto desta página ` +
    `(${pct}%). O restante era título, item de lista ou fragmento sem verbo — ` +
    `não são afirmações e ficaram fora da conta. As proporções descrevem a ` +
    `parte classificada, não a página inteira.`
  );
}

/**
 * Um trecho do texto, com o motivo pelo qual está do jeito que está.
 *
 * `unanalyzed` existe porque havia duas ausências diferentes renderizando
 * idênticas: a sentença que o segmentador descartou e a sentença analisável
 * que ficou fora do cap de truncagem. Pintar as duas igual atribuía à segunda
 * uma razão falsa.
 */
export type Segment =
  | {
      readonly kind: 'classified';
      readonly id: SentenceId;
      readonly text: string;
      readonly category: ClaimCategory;
      readonly label: string;
      /**
       * 0..1. Repasse de `Classification`, para o popover de sentença.
       *
       * Não é computação nova: o dado sempre existiu no payload e nunca
       * chegava à tela. `design-visual-2.md` § 9.3 o exibe.
       */
      readonly confidence: number;
      /** Sinais achados pelo pré-filtro. Também repasse, também inéditos na tela. */
      readonly signals: readonly string[];
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
    analysis.classifications.map((item) => [item.sentenceId, item]),
  );

  return analysis.sentences.map((sentence): Segment => {
    const found = byId.get(sentence.id);
    if (found !== undefined) {
      return {
        kind: 'classified',
        id: sentence.id,
        text: sentence.text,
        category: found.category,
        label: CATEGORY_LABEL[found.category],
        confidence: found.confidence,
        signals: found.signals,
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
 * marca que não está lá.
 */
export interface LegendEntry {
  readonly key: string;
  readonly className: string;
  readonly label: string;
}

export function buildLegend(
  segments: readonly Segment[],
): readonly LegendEntry[] {
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
      label: 'Fora do limite de análise',
    });
  }
  if (kinds.has('excluded')) {
    entries.push({
      key: 'excluded',
      className: 'excluded',
      label: 'Fora da análise',
    });
  }
  return entries;
}

/**
 * A ficha técnica — e é AQUI que o composto de 0 a 100 mora.
 *
 * Não é degredo: é o lugar honesto. A régua é comprimida (o artigo escolhido
 * como modelo de bom conteúdo SEO tira 13 de 100) e instável (uma em seis
 * execuções diverge 8 pontos). Um número nessas condições é diagnóstico, não
 * resultado — e diagnóstico fica na ficha, ao lado da versão e do modelo.
 *
 * Quando a distribuição for medida e a forma final decidida, o campo muda de
 * valor sem que a hierarquia da tela precise mudar.
 */
export interface RecordRow {
  readonly key: string;
  readonly value: string;
}

export function buildRecord(analysis: Analysis): readonly RecordRow[] {
  const rows: RecordRow[] = [
    {
      key: 'artigo',
      value: [
        analysis.title ?? analysis.url,
        analysis.language,
        `${analysis.sentences.length} sentenças, ${analysis.breakdown.analyzableSentences} analisadas`,
      ].join(' · '),
    },
  ];

  if (analysis.outcome.kind === 'scored') {
    const densidade = Math.round(analysis.breakdown.factualDensity * 100);
    rows.push({
      key: 'medição',
      /*
       * A ressalva viaja na MESMA linha do composto, porque a linha pode ser
       * lida isolada num screenshot — que é exatamente o modo de falha que a
       * ADR-004 descreve para ressalva que vive longe do número.
       */
      value: [
        `densidade factual ${densidade}%`,
        `composto ${analysis.outcome.score}/100`,
        `score v${analysis.scoreVersion}`,
        'escala não calibrada',
      ].join(' · '),
    });
  }

  rows.push({
    key: 'execução',
    value: `${(analysis.durationMs / 1000).toFixed(1)} s`,
  });

  return rows;
}
