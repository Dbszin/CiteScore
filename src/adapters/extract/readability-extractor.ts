import { Readability, isProbablyReaderable } from '@mozilla/readability';

import type {
  ContentShape,
  ExtractedContent,
} from '../../core/domain/extracted-content.js';
import { analysisError } from '../../core/domain/errors.js';
import type { ContentExtractor } from '../../core/ports/content-extractor.js';
import type { FetchedPage } from '../../core/ports/content-fetcher.js';
import type { DomParser } from './dom-parser.js';
import { parseWithLinkedom } from './dom-parser.js';
import { blockAwareText } from './html-text.js';
import { detectLanguage } from './language.js';

/**
 * Extração com `@mozilla/readability`.
 *
 * A escolha do Readability é sustentada por medição, não por preferência.
 * No benchmark de 8 páginas reais (`scripts/benchmarks/extraction/`):
 *   - processou 7/8 contra 6/8 do `@extractus/article-extractor`, que
 *     estourou na home do G1 com "Cannot read properties of null";
 *   - detectou idioma em 7/7 contra 0/7;
 *   - expõe `isProbablyReaderable`, exatamente o sinal que a spec precisa
 *     para NO_MAIN_CONTENT — marcou `false` justo na página que era lixo;
 *   - decodifica entidades HTML, enquanto o concorrente vazou `&gt;`.
 */

/** Abaixo disso não há artigo, independentemente do que o parser diga. */
const MIN_WORDS = 60;

interface ReadabilityLike {
  readonly title?: string | null | undefined;
  readonly content?: string | null | undefined;
  readonly lang?: string | null | undefined;
  readonly excerpt?: string | null | undefined;
}

interface DocumentLike {
  readonly documentElement?: { getAttribute(name: string): string | null } | null;
  querySelectorAll(selector: string): ArrayLike<unknown>;
}

function countWords(text: string): number {
  return text.split(/\s+/u).filter((token) => token.length > 0).length;
}

/**
 * Escolhe a raiz que realmente contém o conteúdo.
 *
 * O HTML devolvido pelo Readability é um FRAGMENTO (`<div id="readability-
 * page-1">…`), e as duas bibliotecas de DOM tratam fragmento de formas
 * diferentes: o jsdom envolve em `html/body`; o linkedom promove o próprio
 * `<div>` a `documentElement` e deixa `body` vazio. Confiar em `body` cega
 * o extrator com linkedom — foi exatamente o que aconteceu na primeira
 * medição, e o sintoma (NO_MAIN_CONTENT em 7/7) parecia limitação da
 * biblioteca quando era este bug.
 */
function pickContentRoot(doc: unknown): unknown {
  const candidate = doc as {
    body?: { childNodes?: ArrayLike<unknown> } | null;
    documentElement?: { childNodes?: ArrayLike<unknown> } | null;
  };

  const body = candidate.body;
  if (
    body !== null &&
    body !== undefined &&
    (body.childNodes?.length ?? 0) > 0
  ) {
    return body;
  }

  const root = candidate.documentElement;
  if (
    root !== null &&
    root !== undefined &&
    (root.childNodes?.length ?? 0) > 0
  ) {
    return root;
  }

  return doc;
}

export class ReadabilityExtractor implements ContentExtractor {
  /**
   * Default linkedom, medido contra jsdom sobre os 7 fixtures:
   * saída equivalente em 6/7 (MDN com 1,2% de variância), 3,6x mais rápido
   * (85ms vs 304ms por página) e 2,3x menor em disco (1,8MB vs 4,1MB).
   * A preferência da spec por linkedom deixou de ser fé e passou a ser dado.
   */
  constructor(private readonly parseDom: DomParser = parseWithLinkedom) {}

  async extract(page: FetchedPage): Promise<ExtractedContent> {
    const { document } = this.parseDom(page.html, page.finalUrl);
    const doc = document as DocumentLike;

    let readerable = false;
    try {
      readerable = isProbablyReaderable(document as never);
    } catch {
      readerable = false;
    }

    let article: ReadabilityLike | null = null;
    try {
      article = new Readability(document as never).parse();
    } catch (cause) {
      throw analysisError('NO_MAIN_CONTENT', cause);
    }

    const contentHtml = article?.content ?? '';
    if (article === null || contentHtml.trim().length === 0) {
      throw analysisError('NO_MAIN_CONTENT');
    }

    // ==== CORREÇÃO 1: texto vem de `article.content`, não de textContent ====
    const { document: contentDoc } = this.parseDom(contentHtml, page.finalUrl);
    const text = blockAwareText(pickContentRoot(contentDoc) as never);

    const wordCount = countWords(text);
    if (wordCount < MIN_WORDS) {
      // Home do G1 caiu aqui: 38 palavras e `readerable === false`.
      throw analysisError('NO_MAIN_CONTENT');
    }

    const declaredLang =
      doc.documentElement?.getAttribute('lang') ?? null;
    const language = detectLanguage([article.lang, declaredLang], text);
    if (language === null) {
      throw analysisError('UNSUPPORTED_LANGUAGE');
    }

    const anchorCount = (contentDoc as DocumentLike).querySelectorAll(
      'a[href]',
    ).length;
    const headings = (contentDoc as DocumentLike).querySelectorAll(
      'h1, h2, h3, h4, h5, h6',
    ).length;

    const shape: ContentShape = {
      readerable,
      linkCount: anchorCount,
      headingCount: headings,
      charsPerWord: wordCount === 0 ? 0 : text.length / wordCount,
      linksPerWord: wordCount === 0 ? 0 : anchorCount / wordCount,
    };

    return {
      url: page.finalUrl,
      title: article.title ?? null,
      text,
      language,
      wordCount,
      shape,
    };
  }
}
