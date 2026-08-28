/**
 * Baixa o corpus de calibração para o disco.
 *
 * Separado de `calibrate.ts` de propósito: o download é lento e não custa
 * nada, a calibração é rápida e custa dinheiro. Separar permite reprocessar
 * o corpus quantas vezes for preciso sem rebaixar, e ajustar o prompt sem
 * depender da rede.
 *
 * Uso: npx tsx scripts/calibration/fetch-corpus.ts
 */
import fs from 'node:fs';
import path from 'node:path';

import { decodeHtml } from '../../src/adapters/fetch/charset.js';
import { CORPUS, type CorpusEntry } from './urls.js';

const DATA_DIR = path.join(process.cwd(), 'scripts', 'calibration', 'data');
const INDEX_FILE = path.join(DATA_DIR, 'index.json');

interface FetchRecord {
  readonly entry: CorpusEntry;
  readonly status: number | null;
  readonly finalUrl: string | null;
  readonly contentType: string | null;
  readonly bytes: number;
  readonly file: string | null;
  readonly error: string | null;
}

fs.mkdirSync(DATA_DIR, { recursive: true });

const records: FetchRecord[] = [];

for (const entry of CORPUS) {
  process.stdout.write(`${entry.id.padEnd(24)} `);

  try {
    const response = await fetch(entry.url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(20_000),
      headers: {
        'user-agent':
          'Mozilla/5.0 (compatible; CiteScoreBot/0.2; +https://github.com/Dbszin/CiteScore)',
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8',
      },
    });

    const contentType = response.headers.get('content-type');
    const buffer = Buffer.from(await response.arrayBuffer());

    if (!response.ok) {
      records.push({
        entry,
        status: response.status,
        finalUrl: response.url,
        contentType,
        bytes: buffer.byteLength,
        file: null,
        error: `HTTP ${response.status}`,
      });
      console.log(`HTTP ${response.status}`);
      continue;
    }

    // Respeita o charset declarado, como o fetcher de produção.
    const { html } = decodeHtml(buffer, contentType);
    const file = `${entry.id}.html`;
    fs.writeFileSync(path.join(DATA_DIR, file), html, 'utf8');

    records.push({
      entry,
      status: response.status,
      finalUrl: response.url,
      contentType,
      bytes: buffer.byteLength,
      file,
      error: null,
    });
    console.log(`OK ${(buffer.byteLength / 1024).toFixed(0)}KB`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    records.push({
      entry,
      status: null,
      finalUrl: null,
      contentType: null,
      bytes: 0,
      file: null,
      error: message,
    });
    console.log(`FALHOU: ${message.slice(0, 60)}`);
  }
}

fs.writeFileSync(INDEX_FILE, JSON.stringify(records, null, 2), 'utf8');

const ok = records.filter((record) => record.file !== null).length;
console.log(`\n${ok} de ${records.length} baixados. Índice: ${INDEX_FILE}`);
