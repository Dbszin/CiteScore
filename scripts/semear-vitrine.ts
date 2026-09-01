/**
 * Semeia o cache com os artigos em destaque.
 *
 * POR QUE ISTO EXISTE. O free tier do Gemini dá 20 requisições por dia, por
 * modelo — MEDIDO, não estimado, no cabeçalho de cota da própria API. A duas
 * requisições por análise, são cerca de 10 análises por dia. Num link público,
 * isso acaba antes do café.
 *
 * A vitrine resolve o caso mais comum: quem chega pelo LinkedIn clica no
 * exemplo em vez de colar URL própria. Com os artigos em destaque já semeados,
 * esse clique custa ZERO requisição e responde em milissegundos — sobrando a
 * cota inteira para quem realmente traz um texto seu.
 *
 * NÃO INVENTA ESTRUTURA NOVA. A vitrine é o cache que já existe, gravado por
 * fora e com prazo maior. Um adapter próprio, uma porta própria e um JSON
 * versionado no repositório fariam a mesma coisa com três peças a mais para
 * manter em sincronia.
 *
 * ⚠️ TTL LONGO, MAS NÃO ETERNO. O artigo de terceiro pode mudar, e servir para
 * sempre uma medição de meses atrás seria afirmar sobre um texto que já não
 * existe. Trinta dias é o prazo em que a página provavelmente não mudou e
 * curto o bastante para que ressemear seja hábito, não arqueologia.
 *
 * Uso:
 *   npx tsx scripts/semear-vitrine.ts           # semeia o que estiver faltando
 *   npx tsx scripts/semear-vitrine.ts --forcar  # remede tudo, mesmo o presente
 */
import { readFileSync } from 'node:fs';

for (const linha of readFileSync('.env.local', 'utf8').split('\n')) {
  const casou = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/u.exec(linha);
  const chave = casou?.[1];
  if (chave !== undefined && process.env[chave] === undefined) {
    process.env[chave] = (casou?.[2] ?? '').replace(/^["']|["']$/gu, '');
  }
}

const { loadEnv } = await import('../src/adapters/config/env.js');
const { getAnalyzeUrl } = await import('../src/adapters/config/container.js');
const { UpstashRedisClient } = await import('../src/adapters/redis/upstash-client.js');
const { buildAnalysisCacheKey } = await import('../src/core/domain/cache-key.js');
const { SCORE_VERSION } = await import('../src/core/scoring/weights.js');
const { isAnalysisError } = await import('../src/core/domain/errors.js');

/**
 * Os artigos em destaque.
 *
 * Escolhidos para MOSTRAR A FAIXA, não para favorecer o produto: um post que
 * cita de verdade, uma documentação técnica e uma página pilar. Quem clicar em
 * qualquer um vê um resultado diferente, e a diferença é o argumento.
 */
const DESTAQUES = [
  'https://ahrefs.com/blog/seo-meta-tags/',
  'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Introduction',
  'https://moz.com/learn/seo/what-is-seo',
] as const;

/** 30 dias. Ver a ressalva no cabeçalho: longo, e deliberadamente não eterno. */
const TTL_VITRINE_SEGUNDOS = 30 * 24 * 60 * 60;

const forcar = process.argv.includes('--forcar');
const env = loadEnv();

if ((env.REDIS_URL ?? '') === '' || (env.REDIS_TOKEN ?? '') === '') {
  console.error('REDIS_URL e REDIS_TOKEN sao obrigatorias: a vitrine vive no cache.');
  process.exit(1);
}

const redis = new UpstashRedisClient(env.REDIS_URL ?? '', env.REDIS_TOKEN ?? '');
const analyzeUrl = getAnalyzeUrl();
const modelo = env.LLM_PROVIDER === 'gemini' ? env.GEMINI_MODEL : env.ANTHROPIC_MODEL;

console.log(`provedor ${env.LLM_PROVIDER} · modelo ${modelo}`);
console.log(`prazo    ${TTL_VITRINE_SEGUNDOS / 86_400} dias\n`);

let semeados = 0;
let pulados = 0;
let estendidos = 0;

for (const url of DESTAQUES) {
  const chave = buildAnalysisCacheKey({ url, scoreVersion: SCORE_VERSION, model: modelo });

  if (!forcar) {
    const jaTem = await redis.get(chave).catch(() => null);
    if (jaTem !== null) {
      const restam = await redis.ttl(chave).catch(() => -1);

      /*
       * PRESENTE NAO E' O MESMO QUE SEMEADO.
       *
       * A entrada pode ter vindo de um visitante qualquer, com o prazo curto do
       * cache normal — e a primeira versao deste script tratava isso como
       * "ja semeado", entao o prazo de vitrine nunca era aplicado e o destaque
       * expirava em um dia. Foi o que aconteceu de fato na primeira execucao.
       *
       * Quando o prazo esta curto, basta ESTENDER: a analise ja esta la e
       * continua valida. Reanalisar gastaria requisicao para chegar ao mesmo
       * resultado, e a cota e o recurso escasso aqui.
       */
      if (restam >= TTL_VITRINE_SEGUNDOS / 2) {
        console.log(`= ja em dia    ${url}`);
        console.log(`               vence em ${Math.round(restam / 86_400)} dias\n`);
        pulados += 1;
        continue;
      }

      try {
        await redis.expire(chave, TTL_VITRINE_SEGUNDOS);
        console.log(`^ prazo estendido  ${url}`);
        console.log(
          `               estava com ${Math.max(0, Math.round(restam / 3_600))} h, ` +
            `agora ${TTL_VITRINE_SEGUNDOS / 86_400} dias · ZERO requisicao\n`,
        );
        estendidos += 1;
        continue;
      } catch {
        console.log(`! nao deu para estender, vou remedir  ${url}\n`);
      }
    }
  }

  try {
    const inicio = Date.now();
    /*
     * `refresh: true` de propósito: semear tem que MEDIR, não reaproveitar o
     * que já estivesse guardado. Sem isso, ressemear depois de uma mudança de
     * fórmula copiaria o resultado velho para o prazo novo.
     */
    const analise = await analyzeUrl({
      url,
      clientKey: 'vitrine',
      includeSuggestions: false,
      refresh: true,
    });

    await redis.setWithTtl(chave, JSON.stringify(analise), TTL_VITRINE_SEGUNDOS);

    const b = analise.breakdown;
    const total = b.analyzableSentences;
    const pct = (n: number) => (total === 0 ? '—' : `${Math.round((n / total) * 100)}%`);
    console.log(`+ semeado      ${url}`);
    console.log(
      `               ${Date.now() - inicio} ms · ${total} analisaveis · ` +
        `c/fonte ${pct(b.sourced)} · s/fonte ${pct(b.unsourced)} · op ${pct(b.opinion)}\n`,
    );
    semeados += 1;
  } catch (causa) {
    console.error(`x FALHOU       ${url}`);
    if (isAnalysisError(causa)) {
      console.error(`               ${causa.code}`);
      if (causa.code === 'CLASSIFIER_QUOTA_EXHAUSTED') {
        console.error('               A cota do dia acabou. Rode de novo amanha:');
        console.error('               o que ja foi semeado permanece.\n');
        break;
      }
      console.error(`               ${String(causa.cause).slice(0, 200).replace(/\s+/gu, ' ')}\n`);
    } else {
      console.error(`               ${String(causa).slice(0, 200)}\n`);
    }
  }
}

console.log(
  `${semeados} semeado(s), ${estendidos} com prazo estendido, ${pulados} ja em dia.`,
);
if (semeados + estendidos > 0) {
  console.log('\nEsses artigos agora respondem sem gastar cota, ate o prazo vencer.');
}
