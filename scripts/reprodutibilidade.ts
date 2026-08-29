/**
 * Mede se o MESMO texto produz o MESMO score.
 *
 * Existe porque a resposta era não. Três execuções do artigo do Moz, com as
 * mesmas 100 sentenças analisáveis, deram scores 24, 17 e 25 — e a contagem
 * de OPINION variou de 41 para 18. A variação dentro do mesmo artigo era o
 * DOBRO da separação entre artigos de tipos diferentes.
 *
 * Um score que muda 8 pontos entre execuções do mesmo texto não pode ser
 * apresentado como número: a precisão implícita não existe. Antes de desenhar
 * qualquer apresentação, é preciso saber se ele é reprodutível.
 *
 * Uso: npx tsx scripts/reprodutibilidade.ts [idDoArtigo] [execucoes] [tetoUsd]
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
import { computeScore } from '../src/core/scoring/compute-score.js';
import { countByCategory } from '../src/core/domain/classification.js';
import type { ClassifierUsage } from '../src/core/ports/claim-classifier.js';
import type { FetchedPage } from '../src/core/ports/content-fetcher.js';

const DATA_DIR = path.join(process.cwd(), 'scripts', 'calibration', 'data');

const ARTIGO = process.argv[2] ?? 'en-seo-moz';
const EXECUCOES = Number(process.argv[3] ?? '3');
const TETO_DOLARES = Number(process.argv[4] ?? '0.10');

const PRECOS: Record<string, { input: number; output: number }> = {
  'claude-haiku-4-5': { input: 1, output: 5 },
  'claude-sonnet-5': { input: 2, output: 10 },
  'claude-opus-5': { input: 5, output: 25 },
};

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

function custoDe(usage: ClassifierUsage | null, model: string): number {
  if (usage === null) return 0;
  const preco = PRECOS[model] ?? { input: 0, output: 0 };
  return (
    (usage.inputTokens * preco.input + usage.outputTokens * preco.output) / 1_000_000
  );
}

interface IndexRecord {
  readonly entry: { readonly id: string; readonly url: string };
  readonly file: string | null;
  readonly finalUrl: string | null;
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

const record = index.find((r) => r.entry.id === ARTIGO);
if (record === undefined || record.file === null) {
  throw new Error(`Artigo "${ARTIGO}" não encontrado no corpus baixado`);
}

const htmlPath = path.join(DATA_DIR, record.file);
const page: FetchedPage = {
  finalUrl: record.finalUrl ?? record.entry.url,
  html: fs.readFileSync(htmlPath, 'utf8'),
  contentType: 'text/html; charset=utf-8',
  byteLength: fs.statSync(htmlPath).size,
};

const extractor = new ReadabilityExtractor();
const segmenter = new IntlSentenceSegmenter();
const classifier = new HybridClassifier(
  new ClaudeClassifier(createAnthropicClient(apiKey), {
    model,
    maxSentencesPerCall: Number(env['MAX_SENTENCES_PER_LLM_CALL'] ?? '80'),
  }),
);

// Extração e segmentação são determinísticas e grátis: rodam UMA vez, para que
// a única variável entre execuções seja a classificação.
const content = await extractor.extract(page);
const sentences = segmenter.segment(content);
const analisaveis = sentences.filter((s) => s.analyzable);

console.log(`\n=== REPRODUTIBILIDADE — ${ARTIGO}, modelo ${model} ===`);
console.log(`${analisaveis.length} sentenças analisáveis, ${EXECUCOES} execuções`);
console.log(`Teto de gasto: US$ ${TETO_DOLARES.toFixed(2)}\n`);
console.log('exec   score   SOURCED  UNSOURCED  OPINION      US$');
console.log('-----------------------------------------------------');

const scores: number[] = [];
const sourceds: number[] = [];
const opinions: number[] = [];
let custoTotal = 0;

for (let i = 1; i <= EXECUCOES; i += 1) {
  if (custoTotal + 0.02 > TETO_DOLARES) {
    console.log(`\n>>> PARANDO na execução ${i}: projeção passaria do teto.`);
    break;
  }

  const resultado = await classifier.classify(sentences, content);
  custoTotal += custoDe(resultado.usage, model);

  const { outcome } = computeScore(resultado.classifications, analisaveis.length);
  const contagem = countByCategory(resultado.classifications);
  const score = outcome.kind === 'scored' ? outcome.score : Number.NaN;

  scores.push(score);
  sourceds.push(contagem.SOURCED);
  opinions.push(contagem.OPINION);

  console.log(
    `  ${String(i).padEnd(5)}${String(score).padStart(4)}` +
      `${String(contagem.SOURCED).padStart(10)}` +
      `${String(contagem.UNSOURCED).padStart(11)}` +
      `${String(contagem.OPINION).padStart(9)}` +
      `   ${custoDe(resultado.usage, model).toFixed(4)}`,
  );
}

function amplitude(valores: number[]): number {
  return valores.length === 0 ? 0 : Math.max(...valores) - Math.min(...valores);
}

console.log('\n=== VEREDITO ===');
console.log(`amplitude do score    : ${amplitude(scores)} ponto(s)`);
console.log(`amplitude de SOURCED  : ${amplitude(sourceds)} sentença(s)`);
console.log(`amplitude de OPINION  : ${amplitude(opinions)} sentença(s)`);
console.log(`custo total           : US$ ${custoTotal.toFixed(4)}`);

// A referência é o que foi medido ANTES de `temperature: 0`, com o mesmo
// artigo e as mesmas sentenças.
console.log('\nAntes de `temperature: 0`, o mesmo artigo deu 24, 17 e 25');
console.log('(amplitude 8), com OPINION variando de 41 para 18.');
