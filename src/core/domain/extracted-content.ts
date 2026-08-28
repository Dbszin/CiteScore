export type SupportedLanguage = 'pt-BR' | 'en';

export const SUPPORTED_LANGUAGES: readonly SupportedLanguage[] = ['pt-BR', 'en'];

export function isSupportedLanguage(value: string): value is SupportedLanguage {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

/**
 * Sinais estruturais colhidos durante a extração, usados pela guarda de
 * página-índice (correção 2 do benchmark: home de portal produz lixo
 * plausível em vez de erro, e a contagem mínima de sentenças não pega isso).
 */
export interface ContentShape {
  /** `isProbablyReaderable` do Readability. Marcou `false` na home do G1. */
  readonly readerable: boolean;
  readonly linkCount: number;
  readonly headingCount: number;
  /** Caracteres por palavra. Valor anômalo indica boilerplate preservado. */
  readonly charsPerWord: number;
  /** Links por palavra. Home da Folha: 57/342 = 0,167. */
  readonly linksPerWord: number;
}

export interface ExtractedContent {
  readonly url: string;
  readonly title: string | null;
  /**
   * Texto principal, boilerplate removido.
   *
   * IMPORTANTE (correção 1 do benchmark): este texto NÃO vem de
   * `article.textContent` do Readability, que gruda sentenças sem espaço
   * ("visitors.Every"). É derivado de `article.content` com separador de
   * bloco. Ver `readability-extractor.ts`.
   */
  readonly text: string;
  readonly language: SupportedLanguage;
  readonly wordCount: number;
  readonly shape: ContentShape;
}
