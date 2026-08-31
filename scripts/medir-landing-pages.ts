/**
 * Mede o que o pipeline faz com LANDING PAGES.
 *
 * Existe porque a guarda de página-índice foi calibrada sobre 7 fixtures —
 * MDN, Moz, Ahrefs, Wikipedia, índice do blog do Next.js, home da Folha, home
 * do G1 — e NENHUM deles é landing page. O limiar de `MIN_ANALYZABLE_RATIO`
 * separa artigo de índice; ninguém mediu de que lado uma LP cai.
 *
 * Roda extração + segmentação + a guarda. NÃO chama o LLM, então o custo é
 * zero — é a mesma razão pela qual esta medição podia ter sido feita antes.
 *
 * Uso: npx tsx scripts/medir-landing-pages.ts
 */
import { ReadabilityExtractor } from '../src/adapters/extract/readability-extractor.js';
import { DOM_PARSERS } from '../src/adapters/extract/dom-parser.js';
import { IntlSentenceSegmenter } from '../src/adapters/segment/intl-sentence-segmenter.js';
import { isAnalysisError } from '../src/core/domain/errors.js';
import { assessIndexPage } from '../src/core/domain/index-page-guard.js';
import {
  MIN_ANALYZABLE_RATIO,
  MIN_SENTENCES_FOR_RATIO,
} from '../src/core/scoring/weights.js';
import type { ExclusionReason } from '../src/core/domain/sentence.js';
import type { FetchedPage } from '../src/core/ports/content-fetcher.js';

interface Alvo {
  readonly id: string;
  readonly url: string;
  /** `lp` = landing page de produto. `artigo` = controle, para comparar. */
  readonly tipo: 'lp' | 'artigo';
}

const ALVOS: readonly Alvo[] = [
  { id: 'linear', url: 'https://linear.app/', tipo: 'lp' },
  { id: 'vercel', url: 'https://vercel.com/', tipo: 'lp' },
  { id: 'stripe', url: 'https://stripe.com/', tipo: 'lp' },
  { id: 'resend', url: 'https://resend.com/', tipo: 'lp' },
  { id: 'plausible', url: 'https://plausible.io/', tipo: 'lp' },
  { id: 'rdstation', url: 'https://www.rdstation.com/', tipo: 'lp' },
  // Controle: já sabemos que este passa, e serve de régua na mesma execução.
  { id: 'moz-artigo', url: 'https://moz.com/learn/seo/what-is-seo', tipo: 'artigo' },
];

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/122.0 Safari/537.36 CiteScoreBot/0.7';

const extractor = new ReadabilityExtractor(DOM_PARSERS['jsdom']);
const segmenter = new IntlSentenceSegmenter();

interface Linha {
  readonly id: string;
  readonly tipo: string;
  readonly status: string;
  readonly palavras: number | null;
  readonly total: number | null;
  readonly analisaveis: number | null;
  readonly razao: number | null;
  readonly veredito: string;
  readonly exclusoes: string;
}

async function medir(alvo: Alvo): Promise<Linha> {
  const vazio = {
    id: alvo.id,
    tipo: alvo.tipo,
    palavras: null,
    total: null,
    analisaveis: null,
    razao: null,
    exclusoes: '—',
  };

  let html: string;
  let status: number;
  try {
    const resposta = await fetch(alvo.url, {
      headers: { 'user-agent': UA, accept: 'text/html' },
      redirect: 'follow',
    });
    status = resposta.status;
    html = await resposta.text();
  } catch (causa) {
    return {
      ...vazio,
      status: 'ERRO REDE',
      veredito: causa instanceof Error ? causa.message.slice(0, 40) : 'falhou',
    };
  }

  if (!/^2\d\d$/u.test(String(status))) {
    return { ...vazio, status: String(status), veredito: 'HTTP não-2xx' };
  }

  const pagina: FetchedPage = {
    finalUrl: alvo.url,
    html,
    contentType: 'text/html',
    byteLength: Buffer.byteLength(html),
  };

  let conteudo;
  try {
    conteudo = await extractor.extract(pagina);
  } catch (causa) {
    // A extração barra com erro de domínio — é o portão 1.
    return {
      ...vazio,
      status: String(status),
      veredito: isAnalysisError(causa)
        ? `BARRADA na extração: ${causa.code}`
        : 'erro de extração',
    };
  }

  const sentencas = segmenter.segment(conteudo);
  const guarda = assessIndexPage(sentencas);

  const contagem = new Map<ExclusionReason | 'ok', number>();
  for (const s of sentencas) {
    const chave = s.analyzable ? 'ok' : (s.excludedReason ?? 'short');
    contagem.set(chave, (contagem.get(chave) ?? 0) + 1);
  }
  const exclusoes = [...contagem.entries()]
    .filter(([k]) => k !== 'ok')
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}:${v}`)
    .join(' ');

  return {
    id: alvo.id,
    tipo: alvo.tipo,
    status: String(status),
    palavras: conteudo.wordCount,
    total: guarda.totalSentences,
    analisaveis: guarda.analyzableSentences,
    razao: guarda.analyzableRatio,
    veredito: guarda.isIndexPage
      ? 'BARRADA pela guarda de índice'
      : 'passaria para o LLM',
    exclusoes: exclusoes === '' ? '—' : exclusoes,
  };
}

const linhas: Linha[] = [];
for (const alvo of ALVOS) {
  process.stdout.write(`buscando ${alvo.id}… `);
  const linha = await medir(alvo);
  linhas.push(linha);
  console.log(linha.veredito);
}

console.log('');
console.log(
  `Limiares em uso: razão mínima ${MIN_ANALYZABLE_RATIO}, ` +
    `a partir de ${MIN_SENTENCES_FOR_RATIO} sentenças.`,
);
console.log('');

const col = (v: string | number | null, n: number): string =>
  (v === null ? '—' : typeof v === 'number' ? v.toFixed(v % 1 === 0 ? 0 : 3) : v).padStart(n);

console.log(
  'página'.padEnd(12) +
    'tipo'.padEnd(8) +
    col('palavras', 9) +
    col('sent', 6) +
    col('analis', 8) +
    col('razão', 8) +
    '  veredito',
);
console.log('-'.repeat(96));
for (const l of linhas) {
  console.log(
    l.id.padEnd(12) +
      l.tipo.padEnd(8) +
      col(l.palavras, 9) +
      col(l.total, 6) +
      col(l.analisaveis, 8) +
      col(l.razao, 8) +
      '  ' +
      l.veredito,
  );
}

console.log('');
console.log('Motivos de exclusão por página:');
for (const l of linhas) {
  console.log(`  ${l.id.padEnd(12)} ${l.exclusoes}`);
}
