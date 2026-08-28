import type { SignalTable } from './types.js';

/** Tabela de sinais EN (ADR-002). Espelha a estrutura da tabela PT-BR. */
export const EN_SIGNALS: SignalTable = {
  language: 'en',
  signals: [
    // ─── pró-fonte ────────────────────────────────────────────────────────
    {
      name: 'quantity_with_unit',
      kind: 'source_quantity',
      // Mesmas duas correções da tabela PT-BR: `\b` dentro da alternação
      // (senão `%` nunca casa) e número aceito COM ou SEM separador de
      // milhar (senão "1200%" e "25000 dollars" não casam, embora "78%" e
      // "1,500 points" casem). Unidades de uma letra ficaram fora, exceto 'k'.
      pattern:
        /\b(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?\s*(?:%|(?:percent|k|thousand|million|billion|trillion|dollars|euros|kg|km|mi|lbs?|tons?|hours?|minutes?|days?|months?|years?|points?|bps)\b)/iu,
    },
    {
      name: 'monetary_value',
      kind: 'source_quantity',
      pattern: /(?:\$|US\$|€|£)\s?\d/u,
    },
    {
      name: 'year_or_date',
      kind: 'source_date',
      pattern:
        /\b(?:(?:19|20)\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4}|(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}?,?\s*\d{4})\b/iu,
    },
    {
      name: 'named_attribution',
      kind: 'source_attribution',
      // Determinante opcional entre o conector e a entidade nomeada:
      // "according to the World Bank" precisa casar.
      // Sem flag `i`: a entidade nomeada precisa ser maiúscula. O conector
      // traz as duas caixas porque começo de frase vem capitalizado.
      pattern:
        /\b(?:[Aa]ccording\s+to|[Pp]er\s+the|[Dd]ata\s+from|[Rr]esearch\s+(?:by|from)|[Ss]tudy\s+(?:by|from)|[Rr]eport\s+(?:by|from)|[Ss]urvey\s+(?:by|from)|[Aa]s\s+reported\s+by)\s+(?:(?:the|a|an)\s+)?(?:[A-Z][\w'-]*|[A-Z]{2,})/u,
    },
    {
      name: 'attributed_quote',
      kind: 'source_quote',
      pattern:
        /["“][^"”]{15,}["”]\s*,?\s*(?:said|stated|told|explained|wrote|noted|added)\b/iu,
    },

    // ─── pró-opinião ──────────────────────────────────────────────────────
    {
      name: 'first_person_evaluative',
      kind: 'opinion_first_person',
      pattern:
        /\b(?:I\s+(?:think|believe|feel|prefer|like|love|hate)|in\s+my\s+(?:opinion|view|experience)|to\s+me|personally,|I'd\s+argue)\b/iu,
    },
    {
      name: 'imperative_recommendation',
      kind: 'opinion_imperative',
      pattern:
        /\b(?:you\s+(?:should|must|need\s+to|ought\s+to|have\s+to)|we\s+recommend|I\s+recommend|it'?s\s+worth|don'?t\s+miss|make\s+sure\s+to)\b/iu,
    },
    {
      name: 'evaluative_adjective',
      kind: 'opinion_adjective',
      pattern:
        /\b(?:incredible|revolutionary|essential|crucial|amazing|awesome|fantastic|game-?changing|the\s+best|the\s+worst|stunning|remarkable)\b/iu,
    },

    // ─── hedge (só escala) ────────────────────────────────────────────────
    {
      name: 'uncertain_modal',
      kind: 'hedge_modal',
      pattern:
        /\b(?:maybe|perhaps|possibly|probably|might\s+be|tends?\s+to|usually|generally|typically|apparently|arguably|often)\b/iu,
    },
    {
      name: 'vague_quantifier',
      kind: 'hedge_vague_quantifier',
      pattern:
        /\b(?:many|most|several|various|some|few|numerous|a\s+lot\s+of|the\s+majority)\b/iu,
    },
    {
      name: 'false_authority',
      kind: 'hedge_false_authority',
      pattern:
        /\b(?:studies\s+(?:show|indicate|suggest|prove)|research\s+(?:shows|indicates|suggests)|experts\s+(?:say|agree|recommend|believe)|data\s+shows|it\s+is\s+(?:well\s+)?known\s+that|everyone\s+knows)\b/iu,
    },
  ],
};
