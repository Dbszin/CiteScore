import type {
  PrefilterVerdict,
  SignalName,
} from '../../core/domain/classification.js';
import type {
  ExtractedContent,
  SupportedLanguage,
} from '../../core/domain/extracted-content.js';
import type { Sentence } from '../../core/domain/sentence.js';
import { EN_SIGNALS } from './signals/en.js';
import { PT_BR_SIGNALS } from './signals/pt-br.js';
import {
  HEDGE_KINDS,
  type SignalKind,
  type SignalTable,
} from './signals/types.js';

/**
 * Pré-filtro determinístico (ADR-002).
 *
 * Decide sozinho APENAS em dois casos de alta confiança. Todo o resto escala
 * ao LLM. Em particular:
 *
 *   >>> `UNSOURCED` NUNCA é decidido por regra. <<<
 *
 * Afirmar que uma sentença é uma afirmação sem fonte exige entender se ela é
 * uma afirmação, e regra não faz isso de forma confiável. É a categoria
 * acionável do produto — a que o usuário vai ler e agir. Errar nela por
 * heurística produz erro confiante que não passa por revisão.
 */

const RULE_CONFIDENCE = 0.92;

const TABLES: Record<SupportedLanguage, SignalTable> = {
  'pt-BR': PT_BR_SIGNALS,
  en: EN_SIGNALS,
};

export interface PrefilterMatch {
  readonly names: readonly SignalName[];
  readonly kinds: ReadonlySet<SignalKind>;
}

export function matchSignals(
  text: string,
  table: SignalTable,
): PrefilterMatch {
  const names: SignalName[] = [];
  const kinds = new Set<SignalKind>();

  for (const signal of table.signals) {
    if (signal.pattern.test(text)) {
      names.push(signal.name);
      kinds.add(signal.kind);
    }
  }

  return { names, kinds };
}

function hasAny(
  kinds: ReadonlySet<SignalKind>,
  group: readonly SignalKind[],
): boolean {
  for (const kind of group) {
    if (kinds.has(kind)) return true;
  }
  return false;
}

export class RulePrefilter {
  evaluate(sentence: Sentence, content: ExtractedContent): PrefilterVerdict {
    const table = TABLES[content.language];
    const { names, kinds } = matchSignals(sentence.text, table);

    const hasHedge = hasAny(kinds, HEDGE_KINDS);

    // O desqualificador anula a atribuição que casou por engano — o ordinal
    // "Segundo Trimestre" lido como a preposição "segundo o IBGE".
    // Escalar é sempre preferível a decidir errado.
    const hasAttribution =
      kinds.has('source_attribution') &&
      !kinds.has('attribution_disqualifier');

    const hasQuantityOrDate =
      kinds.has('source_quantity') || kinds.has('source_date');

    // `hasSource` usa a atribuição JÁ desqualificada, para que o caso 2
    // (OPINION direto) não seja bloqueado por uma atribuição inexistente.
    const hasSource =
      hasAttribution ||
      hasQuantityOrDate ||
      kinds.has('source_quote');

    // ─── Caso 1: SOURCED direto ─────────────────────────────────────────
    // Sinal pró-fonte forte E nenhum marcador de hedge.
    //
    // O ramo "link externo + atribuição" da ADR-002 foi REMOVIDO: o
    // parâmetro que o alimentava nunca teve produtor, então o ramo era
    // inalcançável. Reintroduzir exige que a extração emita os offsets dos
    // links no texto — registrado no débito de spec em tasks.md.
    const strongSource =
      (hasQuantityOrDate && hasAttribution) || kinds.has('source_quote');

    if (strongSource && !hasHedge) {
      return {
        kind: 'decided',
        classification: {
          sentenceId: sentence.id,
          category: 'SOURCED',
          confidence: RULE_CONFIDENCE,
          decidedBy: 'rules',
          signals: names,
        },
      };
    }

    // ─── Caso 2: OPINION direto ─────────────────────────────────────────
    // Primeira pessoa avaliativa E nenhum sinal pró-fonte.
    if (kinds.has('opinion_first_person') && !hasSource) {
      return {
        kind: 'decided',
        classification: {
          sentenceId: sentence.id,
          category: 'OPINION',
          confidence: RULE_CONFIDENCE,
          decidedBy: 'rules',
          signals: names,
        },
      };
    }

    // ─── Todo o resto escala ────────────────────────────────────────────
    // Inclui, deliberadamente: falsa autoridade, quantificador vago,
    // adjetivo avaliativo isolado, recomendação imperativa, e qualquer
    // candidato a UNSOURCED.
    return { kind: 'escalate', sentenceId: sentence.id, signals: names };
  }
}
