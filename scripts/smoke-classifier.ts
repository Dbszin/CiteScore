/**
 * Verificação real de ponta a ponta do classificador — DELIBERADAMENTE MÍNIMA.
 *
 * Faz UMA chamada com poucas sentenças, só para provar que a integração
 * funciona contra a API de verdade e para medir `usage` real. Não é
 * calibração: a calibração roda sobre o golden dataset e é o acceptance
 * criteria de M2, com volume de gasto que é decisão do usuário.
 *
 * Uso: npx tsx scripts/smoke-classifier.ts
 */
import fs from 'node:fs';
import path from 'node:path';

import {
  ClaudeClassifier,
  createAnthropicClient,
} from '../src/adapters/classify/claude-classifier.js';
import { HybridClassifier } from '../src/adapters/classify/hybrid-classifier.js';
import { isAnalysisError } from '../src/core/domain/errors.js';
import type { ExtractedContent } from '../src/core/domain/extracted-content.js';
import type { Sentence } from '../src/core/domain/sentence.js';

/** Preço por MTok, para estimar o custo da chamada. */
const PRICING: Record<string, { input: number; output: number }> = {
  'claude-haiku-4-5': { input: 1, output: 5 },
  'claude-sonnet-5': { input: 2, output: 10 },
  'claude-opus-5': { input: 5, output: 25 },
};

function loadEnvLocal(): Record<string, string> {
  const file = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(file)) {
    throw new Error('.env.local não encontrado — a chave da API vive lá.');
  }
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/u)) {
    const match = /^([A-Z0-9_]+)=(.*)$/u.exec(line.trim());
    if (match?.[1] !== undefined && match[2] !== undefined) {
      out[match[1]] = match[2];
    }
  }
  return out;
}

const env = loadEnvLocal();
const apiKey = env['ANTHROPIC_API_KEY'];
const model = env['ANTHROPIC_MODEL'] ?? 'claude-haiku-4-5';

if (apiKey === undefined || apiKey.length === 0) {
  throw new Error('ANTHROPIC_API_KEY vazia em .env.local');
}

/**
 * Quatro sentenças, escolhidas para cobrir os três vereditos e o caso que a
 * ADR-002 chama de coração do produto: falsa autoridade.
 */
const CASOS: readonly { text: string; esperado: string }[] = [
  {
    text: 'Segundo o IBGE, a inflação brasileira fechou 2024 em 4,8% ao ano.',
    esperado: 'SOURCED (deve ser resolvido pelo pré-filtro, sem LLM)',
  },
  {
    text: 'Estudos mostram que a maioria das empresas já adotou a prática.',
    esperado: 'UNSOURCED (falsa autoridade — só o LLM decide)',
  },
  {
    text: 'A adoção de inteligência artificial cresceu no setor jurídico brasileiro.',
    esperado: 'UNSOURCED (afirmação factual sem fonte)',
  },
  {
    text: 'Vale a pena investir tempo na revisão editorial antes de publicar.',
    esperado: 'OPINION (recomendação)',
  },
];

const sentences: Sentence[] = CASOS.map((caso, index) => ({
  id: index,
  text: caso.text,
  start: 0,
  end: caso.text.length,
  analyzable: true,
}));

const content: ExtractedContent = {
  url: 'https://exemplo.test/smoke',
  title: 'Verificação de integração',
  text: CASOS.map((c) => c.text).join('\n'),
  language: 'pt-BR',
  wordCount: 48,
  shape: {
    readerable: true,
    linkCount: 2,
    headingCount: 1,
    charsPerWord: 6,
    linksPerWord: 0.04,
  },
};

const client = createAnthropicClient(apiKey);
const llm = new ClaudeClassifier(client, { model, maxSentencesPerCall: 20 });
const hybrid = new HybridClassifier(llm);

console.log(`\n=== Verificação real: ${model} ===\n`);

// Diagnostico de cache: mede a rubrica e informa se ela alcanca o prefixo
// minimo deste modelo. Sem isso, `cache_creation_input_tokens: 0` pareceria
// falha em vez de consequencia esperada.
const rubricaTokens = await llm.estimateInputTokens(sentences.slice(0, 1), content);
console.log(
  `Cache: rubrica ~${rubricaTokens} tokens -> ` +
    (llm.cacheIsEffective(rubricaTokens)
      ? 'alcanca o prefixo minimo, deve cachear'
      : 'ABAIXO do prefixo minimo deste modelo, NAO vai cachear'),
);

const taxa = hybrid.escalationRate(sentences, content);
console.log(
  `Pré-filtro (grátis): ${taxa.escalated} de ${taxa.analyzable} escalam ao LLM ` +
    `(${(taxa.rate * 100).toFixed(0)}%)\n`,
);

try {
  const inicio = Date.now();
  const result = await hybrid.classify(sentences, content);
  const ms = Date.now() - inicio;

  console.log('id | categoria  | conf | por     | sentença');
  console.log('-'.repeat(78));
  for (const c of [...result.classifications].sort((a, b) => a.sentenceId - b.sentenceId)) {
    const texto = CASOS[c.sentenceId]?.text.slice(0, 42) ?? '';
    console.log(
      `${String(c.sentenceId).padStart(2)} | ${c.category.padEnd(10)} | ` +
        `${c.confidence.toFixed(2)} | ${c.decidedBy.padEnd(7)} | ${texto}…`,
    );
  }

  console.log('\n--- esperado ---');
  for (const [index, caso] of CASOS.entries()) {
    console.log(`${index}: ${caso.esperado}`);
  }

  const usage = result.usage;
  console.log(`\n--- usage real (${ms}ms) ---`);
  if (usage === null) {
    console.log('nenhuma chamada ao LLM');
  } else {
    const price = PRICING[model] ?? { input: 0, output: 0 };
    const custo =
      (usage.inputTokens * price.input + usage.outputTokens * price.output) / 1_000_000;
    console.log(`entrada:      ${usage.inputTokens} tokens`);
    console.log(`saída:        ${usage.outputTokens} tokens`);
    console.log(`cache write:  ${usage.cacheCreationInputTokens} tokens`);
    console.log(`cache read:   ${usage.cacheReadInputTokens} tokens`);
    console.log(`custo:        US$ ${custo.toFixed(6)}`);
    if (usage.cacheCreationInputTokens === 0 && usage.cacheReadInputTokens === 0) {
      console.log(
        '\nNOTA: cache em zero, como previsto — a rubrica não alcança o ' +
          'prefixo mínimo deste modelo.',
      );
    }
  }
} catch (error) {
  const code = isAnalysisError(error) ? error.code : 'ERRO_INESPERADO';
  console.error(`\nFALHOU: ${code}`);
  console.error(error instanceof Error ? error.message : String(error));
  if (error instanceof Error && error.cause !== undefined) {
    console.error('causa:', String(error.cause).slice(0, 500));
  }
  process.exitCode = 1;
}
