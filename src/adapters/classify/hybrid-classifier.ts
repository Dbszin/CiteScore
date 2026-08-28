import type { Classification } from '../../core/domain/classification.js';
import { analysisError } from '../../core/domain/errors.js';
import type { ExtractedContent } from '../../core/domain/extracted-content.js';
import type { Sentence } from '../../core/domain/sentence.js';
import type {
  ClaimClassifier,
  ClassificationResult,
} from '../../core/ports/claim-classifier.js';
import { RulePrefilter } from './rule-prefilter.js';

/**
 * Motor híbrido (ADR-002).
 *
 * É um `ClaimClassifier` que compõe dois `ClaimClassifier` — o caso de uso
 * não sabe que a classificação é híbrida. Trocar por LLM puro ou regras
 * puras não muda uma linha do domínio.
 *
 * O pré-filtro decide apenas os dois casos de alta confiança da ADR-002.
 * Todo o resto escala. Em particular:
 *
 *   >>> `UNSOURCED` NUNCA chega aqui decidido por regra. <<<
 *
 * Essa garantia é estrutural, não convencional: o `RulePrefilter` só emite
 * veredito `decided` para `SOURCED` e `OPINION`. Existe teste-invariante
 * sobre corpus verificando isso.
 */
export class HybridClassifier implements ClaimClassifier {
  constructor(
    private readonly llm: ClaimClassifier,
    private readonly prefilter: RulePrefilter = new RulePrefilter(),
  ) {}

  async classify(
    sentences: readonly Sentence[],
    content: ExtractedContent,
  ): Promise<ClassificationResult> {
    const decided: Classification[] = [];
    const toEscalate: Sentence[] = [];

    for (const sentence of sentences) {
      if (!sentence.analyzable) continue;

      const verdict = this.prefilter.evaluate(sentence, content);
      if (verdict.kind === 'decided') {
        decided.push(verdict.classification);
      } else {
        toEscalate.push(sentence);
      }
    }

    // Nada ambíguo: nenhuma chamada de LLM, nenhum custo. É o melhor caso do
    // desenho híbrido, e acontece de verdade em texto muito factual.
    if (toEscalate.length === 0) {
      return { classifications: decided, usage: null };
    }

    const escalated = await this.llm.classify(toEscalate, content);

    // Rede de segurança: sentença escalada que o LLM não devolveu ficaria
    // fora de N e distorceria o score em silêncio. Preferimos falhar a
    // classificação — que é fatal por definição — a entregar score parcial
    // apresentado como completo.
    const returnedIds = new Set(
      escalated.classifications.map((item) => item.sentenceId),
    );
    const missing = toEscalate.filter(
      (sentence) => !returnedIds.has(sentence.id),
    );
    if (missing.length > 0) {
      throw analysisError('CLASSIFIER_INVALID_OUTPUT');
    }

    return {
      classifications: [...decided, ...escalated.classifications],
      usage: escalated.usage,
    };
  }

  /**
   * Fração de sentenças analisáveis que escalaria ao LLM, sem gastar nada.
   *
   * A ADR-002 estabelece meta de <= 50%. Como o pré-filtro é determinístico e
   * gratuito, essa taxa pode ser medida sobre corpus inteiro antes de
   * qualquer chamada paga — é o que torna a calibração de M2 viável.
   */
  escalationRate(
    sentences: readonly Sentence[],
    content: ExtractedContent,
  ): { rate: number; analyzable: number; escalated: number } {
    let analyzable = 0;
    let escalated = 0;

    for (const sentence of sentences) {
      if (!sentence.analyzable) continue;
      analyzable += 1;
      if (this.prefilter.evaluate(sentence, content).kind === 'escalate') {
        escalated += 1;
      }
    }

    return {
      rate: analyzable === 0 ? 0 : escalated / analyzable,
      analyzable,
      escalated,
    };
  }
}
