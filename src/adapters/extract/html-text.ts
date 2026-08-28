/**
 * Derivação de texto a partir do HTML extraído pelo Readability.
 *
 * ==== CORREÇÃO 1 DO BENCHMARK ====
 * NUNCA usar `article.textContent`. O benchmark real produziu:
 *   "...how to display it to visitors.Every web page has meta tags..."
 *   "August 25th, 2026August 2026 Security Release"
 * O Readability concatena elementos de bloco sem separador. O
 * `Intl.Segmenter` não quebra "visitors.Every" — trata como UMA sentença, e
 * o erro se propaga silenciosamente para classificação, score e highlight.
 *
 * A correção é derivar o texto de `article.content` (o HTML), inserindo
 * separador de bloco. Um bloco por linha, que é também o que permite ao
 * segmentador distinguir heading de parágrafo.
 */

const BLOCK_TAGS = new Set([
  'P', 'DIV', 'SECTION', 'ARTICLE', 'MAIN', 'ASIDE', 'HEADER', 'FOOTER',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'UL', 'OL', 'LI', 'DL', 'DT', 'DD',
  'BLOCKQUOTE', 'PRE', 'FIGURE', 'FIGCAPTION',
  'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TD', 'TH',
  'HR', 'ADDRESS', 'FIELDSET', 'FORM', 'NAV',
]);

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG']);

const NODE_TEXT = 3;
const NODE_ELEMENT = 1;

interface MinimalNode {
  readonly nodeType: number;
  readonly textContent: string | null;
  readonly childNodes: ArrayLike<MinimalNode>;
  readonly tagName?: string;
}

function walk(node: MinimalNode, parts: string[]): void {
  const children = node.childNodes;
  for (let i = 0; i < children.length; i += 1) {
    const child = children[i];
    if (child === undefined) continue;

    if (child.nodeType === NODE_TEXT) {
      parts.push(child.textContent ?? '');
      continue;
    }

    if (child.nodeType !== NODE_ELEMENT) continue;

    const tag = (child.tagName ?? '').toUpperCase();
    if (SKIP_TAGS.has(tag)) continue;

    if (tag === 'BR') {
      parts.push('\n');
      continue;
    }

    const isBlock = BLOCK_TAGS.has(tag);
    if (isBlock) parts.push('\n');
    walk(child, parts);
    // Elemento inline recebe espaço à direita para não grudar em irmãos
    // (`<strong>Meta tags</strong><em>are</em>` → "Meta tags are"). O espaço
    // excedente antes de pontuação é removido na normalização.
    parts.push(isBlock ? '\n' : ' ');
  }
}

export function normalizeText(raw: string): string {
  return raw
    // Todo whitespace MENOS a quebra de linha, que é a fronteira de bloco.
    // Cobre NBSP e espaços tipográficos sem precisar listá-los literalmente.
    .replace(/[^\S\n]+/gu, ' ')
    // espaço injetado antes de pontuação de fechamento
    .replace(/ +([,.;:!?%)\]}»”’…])/gu, '$1')
    // espaço injetado depois de pontuação de abertura
    .replace(/([([{«“‘¿¡]) +/gu, '$1')
    // fronteiras de bloco
    .replace(/[ \t]*\n[ \t]*/gu, '\n')
    .replace(/\n{2,}/gu, '\n')
    .trim();
}

/**
 * Extrai texto com um bloco por linha.
 * `root` é o `body` (ou equivalente) do HTML retornado pelo Readability.
 */
export function blockAwareText(root: MinimalNode): string {
  const parts: string[] = [];
  walk(root, parts);
  return normalizeText(parts.join(''));
}
