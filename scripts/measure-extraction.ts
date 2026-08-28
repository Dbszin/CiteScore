/**
 * Mede o pipeline de extração + segmentação sobre os fixtures do benchmark.
 *
 * Serve a dois propósitos:
 *  1. Calibrar com dados reais o critério da guarda de página-índice
 *     (correção 2), em vez de chutar um limiar.
 *  2. Comparar jsdom e linkedom sobre os mesmos fixtures (correção 4).
 *
 * Uso: npx tsx scripts/measure-extraction.ts [jsdom|linkedom]
 */
import fs from 'node:fs';
import path from 'node:path';

import { DOM_PARSERS, type DomParserName } from '../src/adapters/extract/dom-parser.js';
import { ReadabilityExtractor } from '../src/adapters/extract/readability-extractor.js';
import { IntlSentenceSegmenter } from '../src/adapters/segment/intl-sentence-segmenter.js';
import { isAnalysisError } from '../src/core/domain/errors.js';
import type { FetchedPage } from '../src/core/ports/content-fetcher.js';

const RAW_DIR = path.join(
  process.cwd(),
  'scripts',
  'benchmarks',
  'extraction',
  'data',
  'raw',
);

interface IndexEntry {
  id: string;
  url: string;
  type: string;
  fetch: { status: number; finalUrl: string | null; file: string | null };
}

const parserName = (process.argv[2] ?? 'jsdom') as DomParserName;
const parser = DOM_PARSERS[parserName];
if (parser === undefined) {
  throw new Error(`Parser desconhecido: ${parserName}`);
}

const index = JSON.parse(
  fs.readFileSync(path.join(RAW_DIR, 'index.json'), 'utf8'),
) as IndexEntry[];

const extractor = new ReadabilityExtractor(parser);
const segmenter = new IntlSentenceSegmenter();

console.log(`\n=== parser: ${parserName} ===\n`);
const header = [
  'id'.padEnd(20),
  'type'.padEnd(16),
  'lang'.padEnd(6),
  'words'.padStart(6),
  'sent'.padStart(5),
  'anlz'.padStart(5),
  'ratio'.padStart(6),
  'lnk/w'.padStart(6),
  'ch/w'.padStart(5),
  'rdbl'.padStart(5),
].join(' ');
console.log(header);
console.log('-'.repeat(header.length));

for (const entry of index) {
  if (entry.fetch.file === null) continue;
  const htmlPath = path.join(RAW_DIR, entry.fetch.file);
  if (!fs.existsSync(htmlPath)) {
    console.log(`${entry.id.padEnd(20)} ${entry.type.padEnd(16)} SEM FIXTURE`);
    continue;
  }

  const page: FetchedPage = {
    finalUrl: entry.fetch.finalUrl ?? entry.url,
    html: fs.readFileSync(htmlPath, 'utf8'),
    contentType: 'text/html',
    byteLength: fs.statSync(htmlPath).size,
  };

  try {
    const content = await extractor.extract(page);
    const sentences = segmenter.segment(content);
    const analyzable = sentences.filter((s) => s.analyzable).length;
    const ratio = sentences.length === 0 ? 0 : analyzable / sentences.length;

    console.log(
      [
        entry.id.padEnd(20),
        entry.type.padEnd(16),
        content.language.padEnd(6),
        String(content.wordCount).padStart(6),
        String(sentences.length).padStart(5),
        String(analyzable).padStart(5),
        ratio.toFixed(3).padStart(6),
        content.shape.linksPerWord.toFixed(3).padStart(6),
        content.shape.charsPerWord.toFixed(1).padStart(5),
        String(content.shape.readerable).padStart(5),
      ].join(' '),
    );
  } catch (error) {
    const code = isAnalysisError(error) ? error.code : 'ERRO_INESPERADO';
    const detail = isAnalysisError(error) ? '' : ` (${String(error)})`;
    console.log(
      `${entry.id.padEnd(20)} ${entry.type.padEnd(16)} -> ${code}${detail}`,
    );
  }
}
console.log();
