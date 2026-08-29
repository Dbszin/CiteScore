/**
 * CALIBRAÇÃO — acceptance criteria de M2.
 *
 * Roda o pipeline completo sobre o corpus real e responde a única pergunta
 * que decide o produto: a classificação é boa?
 *
 * Emite três coisas:
 *  1. Tabela por artigo — score, breakdown, taxa de escalonamento, custo
 *  2. Agregado — custo médio, taxa média, verificação da meta da ADR-002
 *  3. CSV sentença a sentença — sem isso, "validação manual em ~10 artigos"
 *     é aspiração; com isso, é uma planilha que alguém confere
 *
 * O custo é acumulado e impresso A CADA artigo, e há teto: uma divergência
 * aparece antes de consumir o orçamento, não depois.
 *
 * Uso: npx tsx scripts/calibrate.ts [tetoEmDolares]
 */
import fs from 'node:fs';
import path from 'node:path';

import {
  ClaudeClassifier,
  createAnthropicClient,
} from '../src/adapters/classify/claude-classifier.js';
import { HybridClassifier } from '../src/adapters/classify/hybrid-classifier.js';
import { ReadabilityExtractor } from '../src/adapters/extract/readability-extractor.js';
import { IntlSentenceSegmenter } from '../src/adapters/segment/intl-sentence-segmenter.js';
import { isAnalysisError } from '../src/core/domain/errors.js';
import { assessIndexPage } from '../src/core/domain/index-page-guard.js';
import { computeScore } from '../src/core/scoring/compute-score.js';
import { SCORE_VERSION } from '../src/core/scoring/weights.js';
import type { ClassifierUsage } from '../src/core/ports/claim-classifier.js';
import type { FetchedPage } from '../src/core/ports/content-fetcher.js';
import type { CorpusEntry } from './calibration/urls.js';

const DATA_DIR = path.join(process.cwd(), 'scripts', 'calibration', 'data');
const OUT_DIR = path.join(process.cwd(), 'scripts', 'calibration', 'output');

const PRICING: Record<string, { input: number; output: number }> = {
  'claude-haiku-4-5': { input: 1, output: 5 },
  'claude-sonnet-5': { input: 2, output: 10 },
  'claude-opus-5': { input: 5, output: 25 },
};

const TETO_DOLARES = Number(process.argv[2] ?? '0.50');
/**
 * Divergência acima disto indica problema, e gastar mais não revela qual.
 *
 * RECALIBRADO em 2026-08-29 com o valor MEDIDO. O 0.007 anterior vinha da
 * projeção da ADR-005, que a própria calibração mostrou estar ~7x abaixo — e
 * por isso o guard abortava em artigos grandes legítimos, confundindo "caro"
 * com "anômalo". O custo real medido pela rota é US$ 0,0155 por artigo típico.
 */
const CUSTO_ESPERADO_POR_ARTIGO = 0.02;
const FATOR_DIVERGENCIA = 5;

function loadEnvLocal(): Record<string, string> {
  const file = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(file)) throw new Error('.env.local não encontrado');
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/u)) {
    const match = /^([A-Z0-9_]+)=(.*)$/u.exec(line.trim());
    if (match?.[1] !== undefined && match[2] !== undefined) out[match[1]] = match[2];
  }
  return out;
}

interface IndexRecord {
  entry: CorpusEntry;
  file: string | null;
  finalUrl: string | null;
}

function custoDe(usage: ClassifierUsage | null, model: string): number {
  if (usage === null) return 0;
  const price = PRICING[model] ?? { input: 0, output: 0 };
  return (
    (usage.inputTokens * price.input + usage.outputTokens * price.output) /
    1_000_000
  );
}

function csvEscape(value: string): string {
  return `"${value.replace(/"/gu, '""')}"`;
}

const env = loadEnvLocal();
const apiKey = env['ANTHROPIC_API_KEY'];
const model = env['ANTHROPIC_MODEL'] ?? 'claude-haiku-4-5';
if (apiKey === undefined || apiKey.length === 0) {
  throw new Error('ANTHROPIC_API_KEY vazia');
}

const index = JSON.parse(
  fs.readFileSync(path.join(DATA_DIR, 'index.json'), 'utf8'),
) as IndexRecord[];

const extractor = new ReadabilityExtractor();
const segmenter = new IntlSentenceSegmenter();
const llm = new ClaudeClassifier(createAnthropicClient(apiKey), {
  model,
  maxSentencesPerCall: Number(env['MAX_SENTENCES_PER_LLM_CALL'] ?? '80'),
});
const hybrid = new HybridClassifier(llm);

fs.mkdirSync(OUT_DIR, { recursive: true });

interface Linha {
  id: string;
  tipo: string;
  lang: string;
  palavras: number;
  sentencas: number;
  analisaveis: number;
  escalados: number;
  taxa: number;
  sourced: number;
  unsourced: number;
  opinion: number;
  score: string;
  custo: number;
  cacheRead: number;
  erro: string | null;
}

const linhas: Linha[] = [];
const csv: string[] = [
  'artigo,sentenca_id,decidido_por,categoria,confianca,sinais,texto',
];
let custoTotal = 0;
let abortado = false;

console.log(`\n=== CALIBRAÇÃO — modelo ${model}, score v${SCORE_VERSION} ===`);
console.log(`Teto de gasto: US$ ${TETO_DOLARES.toFixed(2)}\n`);

for (const record of index) {
  const { entry } = record;

  if (record.file === null) {
    linhas.push({
      id: entry.id, tipo: entry.tipo, lang: entry.lang, palavras: 0,
      sentencas: 0, analisaveis: 0, escalados: 0, taxa: 0, sourced: 0,
      unsourced: 0, opinion: 0, score: '-', custo: 0, cacheRead: 0,
      erro: 'sem fixture',
    });
    continue;
  }

  const htmlPath = path.join(DATA_DIR, record.file);
  const page: FetchedPage = {
    finalUrl: record.finalUrl ?? entry.url,
    html: fs.readFileSync(htmlPath, 'utf8'),
    contentType: 'text/html; charset=utf-8',
    byteLength: fs.statSync(htmlPath).size,
  };

  try {
    const content = await extractor.extract(page);
    const sentences = segmenter.segment(content);
    const indexPage = assessIndexPage(sentences);

    if (indexPage.isIndexPage) {
      linhas.push({
        id: entry.id, tipo: entry.tipo, lang: content.language,
        palavras: content.wordCount, sentencas: sentences.length,
        analisaveis: indexPage.analyzableSentences, escalados: 0, taxa: 0,
        sourced: 0, unsourced: 0, opinion: 0, score: 'INDEX_PAGE',
        custo: 0, cacheRead: 0, erro: null,
      });
      console.log(`${entry.id.padEnd(24)} INDEX_PAGE (razão ${indexPage.analyzableRatio.toFixed(2)})`);
      continue;
    }

    // Taxa medida ANTES de gastar: o pré-filtro é determinístico e grátis.
    const taxa = hybrid.escalationRate(sentences, content);

    const custoProjetado = custoTotal + CUSTO_ESPERADO_POR_ARTIGO;
    if (custoProjetado > TETO_DOLARES) {
      console.log(`\n>>> PARANDO: projeção US$ ${custoProjetado.toFixed(4)} passaria do teto.`);
      abortado = true;
      break;
    }

    const result = await hybrid.classify(sentences, content);
    const custo = custoDe(result.usage, model);
    custoTotal += custo;

    if (custo > CUSTO_ESPERADO_POR_ARTIGO * FATOR_DIVERGENCIA) {
      console.log(
        `\n>>> PARANDO: custo de US$ ${custo.toFixed(4)} neste artigo diverge ` +
          `${(custo / CUSTO_ESPERADO_POR_ARTIGO).toFixed(1)}x da estimativa.`,
      );
      abortado = true;
      break;
    }

    const { outcome, breakdown } = computeScore(
      result.classifications,
      indexPage.analyzableSentences,
    );

    const porTexto = new Map(sentences.map((s) => [s.id, s.text]));
    for (const c of result.classifications) {
      csv.push(
        [
          entry.id, String(c.sentenceId), c.decidedBy, c.category,
          c.confidence.toFixed(2), csvEscape(c.signals.join('|')),
          csvEscape(porTexto.get(c.sentenceId) ?? ''),
        ].join(','),
      );
    }

    linhas.push({
      id: entry.id, tipo: entry.tipo, lang: content.language,
      palavras: content.wordCount, sentencas: sentences.length,
      analisaveis: indexPage.analyzableSentences, escalados: taxa.escalated,
      taxa: taxa.rate, sourced: breakdown.sourced,
      unsourced: breakdown.unsourced, opinion: breakdown.opinion,
      score: outcome.kind === 'scored' ? String(outcome.score) : outcome.reason,
      custo, cacheRead: result.usage?.cacheReadInputTokens ?? 0, erro: null,
    });

    console.log(
      `${entry.id.padEnd(24)} score ${String(
        outcome.kind === 'scored' ? outcome.score : outcome.reason,
      ).padStart(20)}  esc ${(taxa.rate * 100).toFixed(0).padStart(3)}%  ` +
        `US$ ${custo.toFixed(4)}  acum US$ ${custoTotal.toFixed(4)}`,
    );
  } catch (error) {
    const code = isAnalysisError(error) ? error.code : 'ERRO_INESPERADO';
    linhas.push({
      id: entry.id, tipo: entry.tipo, lang: entry.lang, palavras: 0,
      sentencas: 0, analisaveis: 0, escalados: 0, taxa: 0, sourced: 0,
      unsourced: 0, opinion: 0, score: code, custo: 0, cacheRead: 0,
      erro: code,
    });
    console.log(`${entry.id.padEnd(24)} ${code}`);
  }
}

// ─── Relatório ─────────────────────────────────────────────────────────
const analisados = linhas.filter((l) => l.erro === null && l.analisaveis > 0 && l.custo > 0);

console.log('\n\n=== POR ARTIGO ===');
console.log(
  'id'.padEnd(24) + 'tipo'.padEnd(14) + 'lang'.padEnd(7) +
  'palavr'.padStart(7) + 'anlz'.padStart(6) + 'esc%'.padStart(6) +
  'S'.padStart(5) + 'U'.padStart(5) + 'O'.padStart(5) + 'score'.padStart(20) +
  'US$'.padStart(9),
);
console.log('-'.repeat(108));
for (const l of linhas) {
  console.log(
    l.id.padEnd(24) + l.tipo.slice(0, 13).padEnd(14) + l.lang.padEnd(7) +
    String(l.palavras).padStart(7) + String(l.analisaveis).padStart(6) +
    (l.analisaveis > 0 ? (l.taxa * 100).toFixed(0) : '-').padStart(6) +
    String(l.sourced).padStart(5) + String(l.unsourced).padStart(5) +
    String(l.opinion).padStart(5) + l.score.padStart(20) +
    l.custo.toFixed(4).padStart(9),
  );
}

console.log('\n=== AGREGADO ===');
if (analisados.length === 0) {
  console.log('nenhum artigo analisado com sucesso');
} else {
  const taxaMedia =
    analisados.reduce((soma, l) => soma + l.taxa, 0) / analisados.length;
  const custoMedio = custoTotal / analisados.length;
  const cacheTotal = analisados.reduce((soma, l) => soma + l.cacheRead, 0);
  const scores = analisados
    .map((l) => Number(l.score))
    .filter((n) => Number.isFinite(n));

  console.log(`artigos analisados:      ${analisados.length}`);
  console.log(`custo total:             US$ ${custoTotal.toFixed(4)}`);
  console.log(`custo médio por artigo:  US$ ${custoMedio.toFixed(4)}`);
  console.log(
    `taxa média escalonamento: ${(taxaMedia * 100).toFixed(1)}%  ` +
      `(meta ADR-002: <= 50%) -> ${taxaMedia <= 0.5 ? 'ATENDE' : 'NÃO ATENDE'}`,
  );
  console.log(`cache_read total:        ${cacheTotal} tokens`);
  if (scores.length > 0) {
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    const media = scores.reduce((a, b) => a + b, 0) / scores.length;
    console.log(
      `scores:                  min ${min}, média ${media.toFixed(1)}, max ${max} ` +
        `(amplitude ${max - min})`,
    );
  }
  if (abortado) console.log('\n*** EXECUÇÃO ABORTADA PELO TETO DE CUSTO ***');
}

const csvPath = path.join(OUT_DIR, 'calibracao-sentencas.csv');
fs.writeFileSync(csvPath, csv.join('\n'), 'utf8');
const jsonPath = path.join(OUT_DIR, 'calibracao-resumo.json');
fs.writeFileSync(
  jsonPath,
  JSON.stringify({ model, scoreVersion: SCORE_VERSION, custoTotal, linhas }, null, 2),
  'utf8',
);
console.log(`\nCSV para conferência manual: ${csvPath} (${csv.length - 1} sentenças)`);
console.log(`Resumo: ${jsonPath}`);
