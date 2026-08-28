import fs from 'node:fs';
import path from 'node:path';

import type { FetchedPage } from '../../src/core/ports/content-fetcher.js';

/**
 * Fixtures reais reaproveitadas do benchmark de extração.
 *
 * Os 8 HTMLs foram baixados de páginas públicas reais e vivem em
 * `scripts/benchmarks/extraction/data/raw/`. São referenciados por caminho
 * em vez de duplicados: 4 MB copiados para `tests/fixtures/` seriam duas
 * cópias do mesmo dado divergindo com o tempo.
 *
 * Ficam FORA do git (ver .gitignore) por peso. Quem clonar o repositório roda
 * `node scripts/benchmarks/extraction/fetch.js` para regenerá-los — a lista
 * de URLs está versionada em `urls.js`.
 */
export const FIXTURE_DIR = path.join(
  process.cwd(),
  'scripts',
  'benchmarks',
  'extraction',
  'data',
  'raw',
);

export interface FixtureEntry {
  readonly id: string;
  readonly url: string;
  readonly type: string;
  readonly fetch: {
    readonly status: number;
    readonly finalUrl: string | null;
    readonly file: string | null;
  };
}

/**
 * Fixtures MÍNIMOS, versionados em `tests/fixtures/html-min/` (poucos KB).
 * Cobrem artigo, página-índice e latin-1, e rodam em QUALQUER clone.
 */
export const MIN_FIXTURE_DIR = path.join(
  process.cwd(),
  'tests',
  'fixtures',
  'html-min',
);

export function loadMinFixture(name: string): FetchedPage {
  const file = path.join(MIN_FIXTURE_DIR, name);
  return {
    finalUrl: `https://exemplo.test/${name}`,
    html: fs.readFileSync(file, 'utf8'),
    contentType: 'text/html; charset=utf-8',
    byteLength: fs.statSync(file).size,
  };
}

export function loadMinFixtureBytes(name: string): Buffer {
  return fs.readFileSync(path.join(MIN_FIXTURE_DIR, name));
}

/**
 * Os fixtures GRANDES (4 MB, gitignored) podem faltar num clone limpo.
 *
 * Antes, a ausência deles fazia 16 testes virarem `skipped` e a suíte ainda
 * reportava verde — "151/151 passando" era verdade só na máquina de quem
 * baixou os HTMLs. Agora, sob `CI=true` a ausência é ERRO, não silêncio:
 * quem roda em integração contínua precisa ver que a validação real não
 * rodou, em vez de ler um verde que não significa nada.
 */
export function fixturesAvailable(): boolean {
  const present = fs.existsSync(path.join(FIXTURE_DIR, 'index.json'));

  if (!present && process.env['CI'] === 'true') {
    throw new Error(
      'Fixtures reais ausentes com CI=true. Os testes que validam as ' +
        'correções contra páginas reais NÃO rodaram. Execute ' +
        '`node scripts/benchmarks/extraction/fetch.js` antes da suíte.',
    );
  }

  return present;
}

export function loadFixtureIndex(): FixtureEntry[] {
  const raw = fs.readFileSync(path.join(FIXTURE_DIR, 'index.json'), 'utf8');
  return JSON.parse(raw) as FixtureEntry[];
}

/** `null` quando o HTML não está no disco (ex.: o NYT devolveu 403). */
export function loadFixturePage(entry: FixtureEntry): FetchedPage | null {
  if (entry.fetch.file === null) return null;
  const htmlPath = path.join(FIXTURE_DIR, entry.fetch.file);
  if (!fs.existsSync(htmlPath)) return null;

  return {
    finalUrl: entry.fetch.finalUrl ?? entry.url,
    html: fs.readFileSync(htmlPath, 'utf8'),
    contentType: 'text/html',
    byteLength: fs.statSync(htmlPath).size,
  };
}

export function loadFixtureById(id: string): FetchedPage | null {
  const entry = loadFixtureIndex().find((item) => item.id === id);
  if (entry === undefined) return null;
  return loadFixturePage(entry);
}
