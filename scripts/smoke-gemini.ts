/**
 * Chamada REAL ao Gemini, com um punhado de sentenças.
 *
 * Existe porque o teste unitário usa transporte falso, e stub não prova três
 * coisas que só a rede prova:
 *
 *  1. O endpoint existe com esse nome e o modelo está disponível na sua conta
 *  2. A API ACEITA o `responseSchema` que enviamos — schema malformado volta
 *     400, e o stub não valida o que recebe
 *  3. A conta tem cota
 *
 * Custo: uma requisição de classificação e uma de contagem. Dentro do free
 * tier, zero.
 *
 * Uso: npx tsx scripts/smoke-gemini.ts
 * Exige GEMINI_API_KEY no ambiente (ou em .env.local).
 */
import { readFileSync } from 'node:fs';

import { GeminiClassifier } from '../src/adapters/classify/gemini-classifier.js';
import { isAnalysisError } from '../src/core/domain/errors.js';
import type { ExtractedContent } from '../src/core/domain/extracted-content.js';
import type { Sentence } from '../src/core/domain/sentence.js';

/** Lê .env.local sem depender de dotenv — são cinco linhas. */
function carregarEnvLocal(): void {
  let bruto: string;
  try {
    bruto = readFileSync('.env.local', 'utf8');
  } catch {
    return;
  }
  for (const linha of bruto.split('\n')) {
    const casou = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/u.exec(linha);
    if (casou === null) continue;
    const [, chave, valor] = casou;
    if (chave !== undefined && valor !== undefined && process.env[chave] === undefined) {
      process.env[chave] = valor.replace(/^["']|["']$/gu, '');
    }
  }
}

carregarEnvLocal();

const apiKey = process.env['GEMINI_API_KEY'];
if (apiKey === undefined || apiKey === '') {
  console.error('GEMINI_API_KEY ausente. Preencha em .env.local e rode de novo.');
  process.exit(1);
}

const model = process.env['GEMINI_MODEL'] ?? 'gemini-2.0-flash';

/**
 * Uma de cada categoria, escritas à mão para o resultado ser conferível a
 * olho. Se o modelo classificar isto errado, o problema não é de integração.
 */
const TEXTOS = [
  'Segundo o relatório de 2025 da Ahrefs, 96,6% das páginas não recebem tráfego orgânico.',
  'A maioria dos sites falha porque ignora a intenção de busca.',
  'Na nossa visão, essa é a maior oportunidade do ano.',
];

const ESPERADO = ['SOURCED', 'UNSOURCED', 'OPINION'];

const sentences: Sentence[] = TEXTOS.map((text, id) => ({
  id,
  text,
  start: 0,
  end: text.length,
  analyzable: true,
}));

const content: ExtractedContent = {
  url: 'https://exemplo.test/smoke',
  title: 'Smoke',
  text: TEXTOS.join(' '),
  language: 'pt-BR',
  wordCount: 40,
  shape: {
    readerable: true,
    linkCount: 0,
    headingCount: 0,
    charsPerWord: 5,
    linksPerWord: 0,
  },
};

const classifier = new GeminiClassifier({
  apiKey,
  model,
  maxSentencesPerCall: 80,
});

console.log(`modelo: ${model}\n`);

try {
  const tokens = await classifier.estimateInputTokens(sentences, content);
  console.log(`countTokens ....... ${tokens} tokens de entrada`);
} catch (causa) {
  console.error('countTokens FALHOU:', causa instanceof Error ? causa.message : causa);
  if (isAnalysisError(causa)) console.error('  código:', causa.code);
  process.exit(1);
}

try {
  const inicio = Date.now();
  const resultado = await classifier.classify(sentences, content);
  const ms = Date.now() - inicio;

  console.log(`generateContent ... ${ms} ms\n`);

  let acertos = 0;
  resultado.classifications.forEach((c, i) => {
    const esperado = ESPERADO[i];
    const ok = c.category === esperado;
    if (ok) acertos += 1;
    console.log(
      `  ${ok ? 'ok  ' : 'DIF '} [${c.sentenceId}] ${c.category.padEnd(10)} ` +
        `confianca ${c.confidence.toFixed(2)}  (esperado ${esperado})`,
    );
  });

  console.log(`\nuso: ${resultado.usage?.inputTokens} entrada / ${resultado.usage?.outputTokens} saida`);
  console.log(`concordancia com o esperado: ${acertos}/${ESPERADO.length}`);
  console.log('\nA INTEGRACAO FUNCIONA. Divergencia de categoria acima e' + ' julgamento do modelo, nao falha de integracao.');
} catch (causa) {
  console.error('\nclassify FALHOU');
  if (isAnalysisError(causa)) {
    console.error('  código:', causa.code);
    console.error('  mensagem ao usuário:', causa.userMessage);
    if (causa.code === 'CLASSIFIER_QUOTA_EXHAUSTED') {
      console.error('\n  A cota da conta esgotou. Isto NAO e bug — e o caminho');
      console.error('  que o adapter existe para tratar, e a mensagem acima e a');
      console.error('  que o usuario final veria.');
    }
  }
  console.error('  causa:', causa instanceof Error ? causa.message : causa);
  process.exit(1);
}
