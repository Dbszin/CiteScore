import type { SupportedLanguage } from '../../core/domain/extracted-content.js';

/**
 * Detecção de idioma.
 *
 * O benchmark mostrou que o Readability entrega `lang` em 7/7 páginas,
 * enquanto o `@extractus/article-extractor` retornou `null` em 7/7. Esse é
 * um dos motivos medidos para manter o Readability como primário.
 *
 * A heurística de stopwords é fallback para quando o atributo está ausente
 * ou mente.
 */

const PT_STOPWORDS = [
  ' de ', ' da ', ' do ', ' das ', ' dos ', ' que ', ' não ', ' uma ', ' com ',
  ' para ', ' por ', ' como ', ' mais ', ' foi ', ' são ', ' também ', ' já ',
  ' está ', ' pelo ', ' pela ', ' sobre ', ' entre ',
];

const EN_STOPWORDS = [
  ' the ', ' of ', ' and ', ' to ', ' in ', ' that ', ' is ', ' for ', ' with ',
  ' this ', ' from ', ' are ', ' was ', ' which ', ' you ', ' your ', ' have ',
  ' but ', ' not ', ' can ',
];

export function normalizeLanguageTag(tag: string | null | undefined): SupportedLanguage | null {
  if (tag === null || tag === undefined) return null;
  const lower = tag.trim().toLowerCase();
  if (lower.length === 0) return null;
  const primary = lower.split(/[-_]/u)[0];
  if (primary === 'pt') return 'pt-BR';
  if (primary === 'en') return 'en';
  return null;
}

function countOccurrences(haystack: string, needles: readonly string[]): number {
  let total = 0;
  for (const needle of needles) {
    let index = haystack.indexOf(needle);
    while (index !== -1) {
      total += 1;
      index = haystack.indexOf(needle, index + 1);
    }
  }
  return total;
}

/** Fallback por stopwords. `null` quando não há sinal suficiente. */
export function detectByStopwords(text: string): SupportedLanguage | null {
  const sample = ` ${text.slice(0, 20_000).toLowerCase()} `;
  const pt = countOccurrences(sample, PT_STOPWORDS);
  const en = countOccurrences(sample, EN_STOPWORDS);

  if (pt === 0 && en === 0) return null;
  // Exige margem: empate técnico não é detecção.
  if (pt >= en * 1.2) return 'pt-BR';
  if (en >= pt * 1.2) return 'en';
  return null;
}

export function detectLanguage(
  declaredTags: readonly (string | null | undefined)[],
  text: string,
): SupportedLanguage | null {
  for (const tag of declaredTags) {
    const normalized = normalizeLanguageTag(tag);
    if (normalized !== null) return normalized;
  }
  return detectByStopwords(text);
}
