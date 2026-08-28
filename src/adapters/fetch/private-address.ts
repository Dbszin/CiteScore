/**
 * SSRF é o maior risco de segurança deste produto: aceitamos uma URL
 * arbitrária de um visitante anônimo e fazemos uma requisição de SERVIDOR
 * para ela. Sem estas defesas, o endpoint é um proxy aberto para a rede
 * interna de quem hospeda.
 *
 * Lógica pura e sem I/O, para ser testável exaustivamente.
 */

/** Resultado de três estados: a diferença entre "liberado" e "não sei". */
export type AddressVerdict = 'blocked' | 'allowed' | 'unparseable';

function ipv4ToInt(address: string): number | null {
  const parts = address.split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/u.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = value * 256 + octet;
  }
  return value;
}

/** [primeiro, último] de cada faixa bloqueada, em inteiro. */
const BLOCKED_IPV4_RANGES: readonly (readonly [number, number])[] = [
  [0x00000000, 0x00ffffff], // 0.0.0.0/8       — "this network"
  [0x0a000000, 0x0affffff], // 10.0.0.0/8      — privada
  [0x64400000, 0x647fffff], // 100.64.0.0/10   — CGNAT
  [0x7f000000, 0x7fffffff], // 127.0.0.0/8     — loopback
  [0xa9fe0000, 0xa9feffff], // 169.254.0.0/16  — link-local (inclui metadata)
  [0xac100000, 0xac1fffff], // 172.16.0.0/12   — privada
  [0xc0000000, 0xc00000ff], // 192.0.0.0/24    — IETF protocol assignments
  [0xc6120000, 0xc613ffff], // 198.18.0.0/15   — benchmarking (roteável interno)
  [0xc0586300, 0xc05863ff], // 192.88.99.0/24  — relay 6to4 (anycast)
  [0xc0a80000, 0xc0a8ffff], // 192.168.0.0/16  — privada
  [0xe0000000, 0xffffffff], // 224.0.0.0/4 +   — multicast e reservado
];

function classifyIpv4(address: string): AddressVerdict {
  const value = ipv4ToInt(address);
  if (value === null) return 'unparseable';
  for (const [start, end] of BLOCKED_IPV4_RANGES) {
    if (value >= start && value <= end) return 'blocked';
  }
  return 'allowed';
}

/**
 * Expande um IPv6 possivelmente comprimido em 8 grupos numéricos.
 * `null` quando a forma não é reconhecida — e "não reconhecida" nunca
 * significa "liberada" (ver `classifyAddress`).
 */
function expandIpv6(input: string): number[] | null {
  let text = input;

  // IPv4 embutido na cauda: ::ffff:169.254.169.254 e variantes.
  const tail = /^(.*:)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/u.exec(text);
  if (tail !== null) {
    const prefix = tail[1];
    const dotted = tail[2];
    if (prefix === undefined || dotted === undefined) return null;
    const asInt = ipv4ToInt(dotted);
    if (asInt === null) return null;
    const high = (asInt >>> 16) & 0xffff;
    const low = asInt & 0xffff;
    text = `${prefix}${high.toString(16)}:${low.toString(16)}`;
  }

  const halves = text.split('::');
  if (halves.length > 2) return null;

  const parseGroups = (chunk: string): number[] | null => {
    if (chunk.length === 0) return [];
    const groups: number[] = [];
    for (const raw of chunk.split(':')) {
      if (!/^[0-9a-f]{1,4}$/u.test(raw)) return null;
      groups.push(parseInt(raw, 16));
    }
    return groups;
  };

  if (halves.length === 1) {
    const only = halves[0];
    if (only === undefined) return null;
    const groups = parseGroups(only);
    return groups !== null && groups.length === 8 ? groups : null;
  }

  const left = parseGroups(halves[0] ?? '');
  const right = parseGroups(halves[1] ?? '');
  if (left === null || right === null) return null;

  const missing = 8 - left.length - right.length;
  if (missing < 1) return null;
  return [...left, ...Array<number>(missing).fill(0), ...right];
}

function classifyIpv6(address: string): AddressVerdict {
  const lower = address.toLowerCase().replace(/^\[|\]$/gu, '');

  // Zona de escopo (`fe80::1%eth0`) nunca é endereço público.
  if (lower.includes('%')) return 'blocked';

  const groups = expandIpv6(lower);
  if (groups === null) return 'unparseable';

  const [g0, g1, g2, g3, g4, g5, g6, g7] = groups as [
    number, number, number, number, number, number, number, number,
  ];

  // :: (unspecified) e ::1 (loopback)
  const isAllZeroPrefix =
    g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0;
  if (isAllZeroPrefix && g5 === 0 && g6 === 0 && (g7 === 0 || g7 === 1)) {
    return 'blocked';
  }

  // IPv4-mapeado ::ffff:a.b.c.d — inclusive na forma HEXADECIMAL, que é o
  // que o parser de URL do WHATWG produz: `[::ffff:169.254.169.254]` sai
  // como `[::ffff:a9fe:a9fe]`. A versão anterior só reconhecia a forma
  // pontilhada, então o teste dava confiança falsa: validava uma forma que
  // nunca chega por esse caminho.
  if (isAllZeroPrefix && g5 === 0xffff) {
    const embedded = `${(g6 >>> 8) & 0xff}.${g6 & 0xff}.${(g7 >>> 8) & 0xff}.${g7 & 0xff}`;
    return classifyIpv4(embedded);
  }

  // IPv4-compatível ::a.b.c.d (obsoleto, mas ainda roteável em alguns stacks)
  if (isAllZeroPrefix && g5 === 0 && (g6 !== 0 || g7 !== 0)) {
    const embedded = `${(g6 >>> 8) & 0xff}.${g6 & 0xff}.${(g7 >>> 8) & 0xff}.${g7 & 0xff}`;
    return classifyIpv4(embedded);
  }

  // fc00::/7 — unique local. `padStart`, não `padEnd`: grupo IPv6 é
  // preenchido à ESQUERDA. Com padEnd, `fc::1` (que é 00fc:…:1, público)
  // era lido como fc00 e bloqueado por engano.
  if ((g0 & 0xfe00) === 0xfc00) return 'blocked';
  // fe80::/10 — link-local
  if ((g0 & 0xffc0) === 0xfe80) return 'blocked';
  // 2002::/16 — 6to4, encapsula um IPv4 que pode ser interno
  if (g0 === 0x2002) {
    const embedded = `${(g1 >>> 8) & 0xff}.${g1 & 0xff}.${(g2 >>> 8) & 0xff}.${g2 & 0xff}`;
    if (classifyIpv4(embedded) === 'blocked') return 'blocked';
  }

  return 'allowed';
}

export function classifyAddress(address: string): AddressVerdict {
  return address.includes(':') ? classifyIpv6(address) : classifyIpv4(address);
}

/**
 * FALHA FECHADA: o que não conseguimos interpretar é tratado como bloqueado.
 *
 * A versão anterior devolvia `false` (liberado) quando o parsing falhava —
 * checagem de segurança que falha em aberto. Esta função recebe endereços
 * já resolvidos pelo DNS, então "não parseia" significa "forma inesperada",
 * e forma inesperada é exatamente o caso em que não se deve confiar.
 */
export function isBlockedAddress(address: string): boolean {
  return classifyAddress(address) !== 'allowed';
}

/** Nomes que nunca devem ser resolvidos, mesmo antes do DNS. */
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata',
  'metadata.google.internal',
  'instance-data',
]);

/** Um hostname que já é literal de IP, e não um nome a resolver. */
function looksLikeIpLiteral(hostname: string): boolean {
  return (
    hostname.includes(':') ||
    hostname.startsWith('[') ||
    /^[\d.]+$/u.test(hostname)
  );
}

export function isBlockedHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase().replace(/\.$/u, '');
  if (BLOCKED_HOSTNAMES.has(lower)) return true;
  // TLDs reservados para uso interno
  if (/\.(?:local|internal|localdomain|home|lan)$/u.test(lower)) return true;

  // `isBlockedAddress` falha fechada, então só pode ser aplicado a algo que
  // realmente é literal de IP. Um nome de domínio comum não parseia como
  // endereço e seria bloqueado por engano.
  if (looksLikeIpLiteral(lower)) return isBlockedAddress(lower);

  return false;
}
