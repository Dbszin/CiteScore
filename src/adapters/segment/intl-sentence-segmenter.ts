import type { ExtractedContent } from '../../core/domain/extracted-content.js';
import type {
  ExclusionReason,
  Sentence,
} from '../../core/domain/sentence.js';
import type { SentenceSegmenter } from '../../core/ports/sentence-segmenter.js';

/**
 * Segmentação com `Intl.Segmenter` — nativo do runtime, zero dependência.
 *
 * O texto que chega aqui vem do `ReadabilityExtractor` com UM BLOCO POR LINHA
 * (correção 1 do benchmark). Isso é o que permite distinguir heading de
 * parágrafo: o segmentador processa bloco a bloco, e um bloco sem pontuação
 * terminal é candidato a heading, não a sentença.
 *
 * Se o texto viesse concatenado — como `article.textContent` do Readability
 * entrega —, essa distinção seria impossível e "visitors.Every" contaria
 * como uma sentença só.
 */

const MIN_WORDS_ANALYZABLE = 5;
const MAX_WORDS_HEADING = 12;
const MAX_WORDS_FOR_NO_VERB_CHECK = 8;

const TERMINAL_PUNCTUATION = /[.!?…]["'”’)\]]*\s*$/u;
const LIST_MARKER = /^\s*(?:[•·‣▪–—*+]|\d{1,3}[.)]|[a-z][.)])\s+/iu;

/** Formas verbais frequentes em PT-BR e EN, como sinal de "isto é oração". */
const VERB_STOPWORDS = new Set([
  // pt-BR
  'é', 'são', 'era', 'eram', 'foi', 'foram', 'ser', 'sendo', 'sido',
  'está', 'estão', 'estava', 'estavam', 'estar',
  'tem', 'têm', 'tinha', 'tinham', 'ter', 'tendo',
  'há', 'havia', 'houve', 'haver',
  'pode', 'podem', 'podia', 'poder', 'deve', 'devem', 'dever',
  'faz', 'fazem', 'fez', 'fazer', 'vai', 'vão', 'será', 'serão',
  'tornou', 'passou', 'ficou', 'usa', 'usam', 'mostra', 'mostram',
  // en
  'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'has', 'have', 'had', 'do', 'does', 'did',
  'can', 'could', 'will', 'would', 'should', 'may', 'might', 'must',
  'makes', 'make', 'made', 'shows', 'show', 'uses', 'use', 'means',
]);

/** Sufixos que sugerem verbo conjugado. Sinal fraco, usado como complemento. */
const VERB_SUFFIXES = [
  'ando', 'endo', 'indo', 'ção', // pt: gerúndio (e nominalização, aceita de propósito)
  'aram', 'eram', 'iram', 'ava', 'iam', 'ria', 'rão', 'sse',
  'ou', 'am', 'em',
  'ing', 'ed', // en
];

function words(text: string): string[] {
  return text.split(/\s+/u).filter((token) => token.length > 0);
}

function normalize(token: string): string {
  return token.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

function hasVerbSignal(text: string): boolean {
  const tokens = words(text).map(normalize).filter(Boolean);
  for (const token of tokens) {
    if (VERB_STOPWORDS.has(token)) return true;
  }
  for (const token of tokens) {
    if (token.length < 4) continue;
    for (const suffix of VERB_SUFFIXES) {
      if (token.endsWith(suffix)) return true;
    }
  }
  return false;
}

/**
 * Um bloco inteiro pode ser heading, item de lista ou legenda. Nesse caso
 * nenhuma sentença dele é analisável — não conta em N nem é classificada.
 */
function classifyBlock(block: string): ExclusionReason | null {
  const trimmed = block.trim();
  if (trimmed.length === 0) return 'short';

  if (LIST_MARKER.test(trimmed)) {
    const withoutMarker = trimmed.replace(LIST_MARKER, '');
    if (words(withoutMarker).length < MIN_WORDS_ANALYZABLE) return 'list_item';
  }

  const wordCount = words(trimmed).length;
  const hasTerminal = TERMINAL_PUNCTUATION.test(trimmed);

  // Sem pontuação terminal e curto: título, subtítulo, rótulo de card,
  // manchete de home. A home da Folha é feita disso.
  if (!hasTerminal && wordCount <= MAX_WORDS_HEADING) return 'heading';

  return null;
}

function classifySentence(text: string): ExclusionReason | null {
  const trimmed = text.trim();
  const wordCount = words(trimmed).length;

  if (wordCount < MIN_WORDS_ANALYZABLE) return 'short';

  // `no_verb` só se aplica a fragmento SEM pontuação terminal.
  //
  // A versão anterior checava toda sentença curta e produziu falso positivo
  // imediato: "O consumo das famílias reagiu rápido." e "They tell search
  // engines about your page." foram excluídas da análise por não casarem
  // com a lista de verbos — que nenhuma lista finita vai cobrir.
  //
  // Pontuação terminal é sinal forte de oração completa e vale mais que a
  // heurística. Fragmento sem pontuação já cai em `heading` no nível do
  // bloco; esta regra pega o resto. Falso positivo aqui excluiria sentença
  // legítima da análise, que é o erro mais caro dos dois.
  const hasTerminal = TERMINAL_PUNCTUATION.test(trimmed);
  if (
    !hasTerminal &&
    wordCount <= MAX_WORDS_FOR_NO_VERB_CHECK &&
    !hasVerbSignal(trimmed)
  ) {
    return 'no_verb';
  }

  return null;
}

export class IntlSentenceSegmenter implements SentenceSegmenter {
  private readonly segmenters = new Map<string, Intl.Segmenter>();

  private segmenterFor(locale: string): Intl.Segmenter {
    const existing = this.segmenters.get(locale);
    if (existing !== undefined) return existing;
    const created = new Intl.Segmenter(locale, { granularity: 'sentence' });
    this.segmenters.set(locale, created);
    return created;
  }

  segment(content: ExtractedContent): readonly Sentence[] {
    const segmenter = this.segmenterFor(content.language);
    const sentences: Sentence[] = [];
    const text = content.text;

    let id = 0;
    let cursor = 0;

    for (const block of text.split('\n')) {
      const blockStart = cursor;
      cursor += block.length + 1; // +1 pelo '\n' consumido

      if (block.trim().length === 0) continue;

      const blockExclusion = classifyBlock(block);

      for (const part of segmenter.segment(block)) {
        const raw = part.segment;
        if (raw.trim().length === 0) continue;

        // Offsets absolutos no texto extraído, para o highlight inline.
        const leadingWhitespace = raw.length - raw.trimStart().length;
        const start = blockStart + part.index + leadingWhitespace;
        const trimmedText = raw.trim();
        const end = start + trimmedText.length;

        const exclusion = blockExclusion ?? classifySentence(trimmedText);

        sentences.push(
          exclusion === null
            ? {
                id,
                text: trimmedText,
                start,
                end,
                analyzable: true,
              }
            : {
                id,
                text: trimmedText,
                start,
                end,
                analyzable: false,
                excludedReason: exclusion,
              },
        );
        id += 1;
      }
    }

    return sentences;
  }
}
