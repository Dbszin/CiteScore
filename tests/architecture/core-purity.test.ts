import fs from 'node:fs';
import path from 'node:path';

import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

/**
 * Gate de M1: ADR-001 exige que `src/core/**` permaneça puro.
 *
 * "Exige disciplina" não é garantia — um único import de infraestrutura
 * quebra a propriedade que justifica a arquitetura inteira. Estes testes
 * transferem a verificação da memória de quem revisa para a máquina.
 */
describe('Pureza de src/core (ADR-001)', () => {
  const eslint = new ESLint({ cwd: process.cwd() });

  async function lintInCore(code: string) {
    const results = await eslint.lintText(code, {
      filePath: path.join(process.cwd(), 'src', 'core', '__virtual__.ts'),
    });
    return results[0]?.messages ?? [];
  }

  const proibidos = [
    ['next', "import { NextResponse } from 'next/server';"],
    ['@anthropic-ai/sdk', "import Anthropic from '@anthropic-ai/sdk';"],
    ['@mozilla/readability', "import { Readability } from '@mozilla/readability';"],
    ['jsdom', "import { JSDOM } from 'jsdom';"],
    ['linkedom', "import { parseHTML } from 'linkedom';"],
    ['react', "import React from 'react';"],
    ['node:fs', "import fs from 'node:fs';"],
  ] as const;

  for (const [label, code] of proibidos) {
    it(`a regra DISPARA para import de ${label}`, async () => {
      const messages = await lintInCore(code);
      const restricted = messages.filter(
        (message) => message.ruleId === 'no-restricted-imports',
      );
      expect(
        restricted.length,
        `esperava no-restricted-imports para: ${code}\nmensagens: ${JSON.stringify(messages)}`,
      ).toBeGreaterThan(0);
      expect(restricted[0]?.message).toContain('ADR-001');
    });
  }

  it('a regra NÃO dispara para import relativo dentro do domínio', async () => {
    const messages = await lintInCore(
      "import type { Sentence } from './domain/sentence.js';\nexport const x: Sentence[] = [];",
    );
    const restricted = messages.filter(
      (message) => message.ruleId === 'no-restricted-imports',
    );
    expect(restricted).toHaveLength(0);
  });

  it('a regra NÃO dispara para zod fora de core... mas core não o usa', async () => {
    // zod não está na lista de bloqueio: é validação de dados, não
    // infraestrutura de I/O. Ainda assim, hoje só adapters o importam.
    const messages = await lintInCore("import { z } from 'zod';");
    const restricted = messages.filter(
      (message) => message.ruleId === 'no-restricted-imports',
    );
    expect(restricted).toHaveLength(0);
  });
});

describe('Pureza de src/core — verificação estática dos arquivos reais', () => {
  const CORE_DIR = path.join(process.cwd(), 'src', 'core');

  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, out);
      else if (entry.name.endsWith('.ts')) out.push(full);
    }
    return out;
  }

  it('nenhum arquivo de src/core importa infraestrutura', () => {
    const files = walk(CORE_DIR);
    expect(files.length).toBeGreaterThan(10);

    const proibidos =
      /from\s+['"](?:next|next\/[^'"]*|react|react-dom|@anthropic-ai\/sdk[^'"]*|@mozilla\/readability|jsdom|linkedom|node:fs|node:http|node:https|fs|http|https)['"]/u;

    const violacoes: string[] = [];
    for (const file of files) {
      const source = fs.readFileSync(file, 'utf8');
      if (proibidos.test(source)) {
        violacoes.push(path.relative(process.cwd(), file));
      }
    }

    expect(violacoes).toEqual([]);
  });
});
