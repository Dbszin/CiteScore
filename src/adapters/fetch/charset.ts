/**
 * Decodificação respeitando o charset declarado.
 *
 * O bug corrigido: `Buffer.concat(chunks).toString('utf8')` incondicional,
 * com o `content-type` lido e descartado. Site que declara `iso-8859-1` ou
 * `windows-1252` — ainda comum em veículos brasileiros, que são o mercado
 * primário do produto — era decodificado como UTF-8 e virava mojibake.
 *
 * O dano não fica na aparência: as tabelas de sinais PT-BR são cheias de
 * acento (`inflação`, `está`, `relatório`, `milhões`), então texto corrompido
 * derruba a detecção de sinais e degrada o score. Os 7 fixtures são todos
 * UTF-8, por isso nenhum teste pegava.
 */

const DEFAULT_ENCODING = 'utf-8';

/** Aliases que o TextDecoder do Node aceita, normalizados. */
const ENCODING_ALIASES: Record<string, string> = {
  'utf8': 'utf-8',
  'utf-8': 'utf-8',
  'iso-8859-1': 'windows-1252',
  'iso8859-1': 'windows-1252',
  'latin1': 'windows-1252',
  'latin-1': 'windows-1252',
  'windows-1252': 'windows-1252',
  'cp1252': 'windows-1252',
  'iso-8859-15': 'iso-8859-15',
  'utf-16le': 'utf-16le',
  'utf-16': 'utf-16le',
  'utf-16be': 'utf-16be',
  'shift_jis': 'shift_jis',
  'euc-jp': 'euc-jp',
  'gbk': 'gbk',
  'gb2312': 'gbk',
  'big5': 'big5',
};

/**
 * `iso-8859-1` mapeia para `windows-1252` de propósito: é o que a
 * especificação HTML manda fazer, porque na prática as páginas que declaram
 * latin-1 usam os caracteres do intervalo 0x80–0x9F que só o cp1252 define.
 */
export function normalizeEncoding(label: string | null | undefined): string | null {
  if (label === null || label === undefined) return null;
  const key = label.trim().toLowerCase().replace(/^["']|["']$/gu, '');
  if (key.length === 0) return null;
  return ENCODING_ALIASES[key] ?? null;
}

/** Extrai `charset=` de um header `content-type`. */
export function charsetFromContentType(
  contentType: string | null | undefined,
): string | null {
  if (contentType === null || contentType === undefined) return null;
  const match = /charset\s*=\s*("[^"]*"|'[^']*'|[^;\s]+)/iu.exec(contentType);
  return normalizeEncoding(match?.[1]);
}

/**
 * Procura `<meta charset>` ou `<meta http-equiv="content-type">` nos
 * primeiros bytes. A especificação HTML limita o sniffing a 1024 bytes;
 * usamos o mesmo teto para não varrer a página inteira.
 */
export function charsetFromMetaTag(bytes: Uint8Array): string | null {
  const head = Buffer.from(
    bytes.subarray(0, Math.min(bytes.byteLength, 1024)),
  ).toString('latin1');

  const metaCharset = /<meta[^>]+charset\s*=\s*["']?([\w-]+)/iu.exec(head);
  const fromCharset = normalizeEncoding(metaCharset?.[1]);
  if (fromCharset !== null) return fromCharset;

  const httpEquiv =
    /<meta[^>]+http-equiv\s*=\s*["']?content-type["']?[^>]*content\s*=\s*["'][^"']*charset\s*=\s*([\w-]+)/iu.exec(
      head,
    );
  return normalizeEncoding(httpEquiv?.[1]);
}

/**
 * Ordem de precedência, seguindo a especificação HTML:
 * header HTTP → `<meta>` no documento → UTF-8.
 */
export function decodeHtml(
  bytes: Uint8Array,
  contentType: string | null,
): { html: string; encoding: string } {
  const encoding =
    charsetFromContentType(contentType) ??
    charsetFromMetaTag(bytes) ??
    DEFAULT_ENCODING;

  try {
    const decoder = new TextDecoder(encoding);
    return { html: decoder.decode(bytes), encoding };
  } catch {
    // Encoding declarado que o runtime não conhece: cair para UTF-8 é
    // melhor que falhar a análise inteira.
    const decoder = new TextDecoder(DEFAULT_ENCODING);
    return { html: decoder.decode(bytes), encoding: DEFAULT_ENCODING };
  }
}
