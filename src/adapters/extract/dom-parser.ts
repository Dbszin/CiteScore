import { JSDOM } from 'jsdom';
import { parseHTML } from 'linkedom';

/**
 * Fronteira de parsing de DOM.
 *
 * ==== CORREÇÃO 4 DO BENCHMARK ====
 * O benchmark rodou com jsdom; a spec pedia linkedom por peso em ambiente
 * serverless. Ninguém mediu se linkedom reproduz o resultado do Readability.
 *
 * Em vez de adotar por fé, o parser é injetável e existe um teste que roda
 * os dois sobre os mesmos fixtures e compara. A escolha de produção sai da
 * medição, não da suposição.
 */

export interface ParsedDocument {
  /** Tipado como `unknown` porque jsdom e linkedom expõem tipos distintos. */
  readonly document: unknown;
}

export type DomParser = (html: string, url: string) => ParsedDocument;

export type DomParserName = 'jsdom' | 'linkedom';

export const parseWithJsdom: DomParser = (html, url) => {
  const dom = new JSDOM(html, { url });
  return { document: dom.window.document };
};

export const parseWithLinkedom: DomParser = (html) => {
  const { document } = parseHTML(html);
  return { document };
};

export const DOM_PARSERS: Record<DomParserName, DomParser> = {
  jsdom: parseWithJsdom,
  linkedom: parseWithLinkedom,
};
