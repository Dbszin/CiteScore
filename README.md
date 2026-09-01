<p align="center">
  <img src="assets/banner.png" width="820" alt="CiteScore — análise de densidade factual. Quanto do seu artigo se sustenta de verdade.">
</p>

<h1 align="center">CiteScore</h1>

<p align="center">
  <em>Quanto do seu artigo se sustenta em dado ou fonte — afirmação por afirmação.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/static/v1?label=Next.js&message=15&color=5eead4&labelColor=0b0f14&style=flat-square" alt="Next.js 15">
  <img src="https://img.shields.io/static/v1?label=TypeScript&message=strict&color=5eead4&labelColor=0b0f14&style=flat-square" alt="TypeScript em modo strict">
  <img src="https://img.shields.io/static/v1?label=arquitetura&message=hexagonal&color=5eead4&labelColor=0b0f14&style=flat-square" alt="Arquitetura hexagonal">
</p>

<br>

## O que é

Você escreveu um artigo. Antes de publicar, quer saber **quais** afirmações estão penduradas sem fonte.

Cola o link. O CiteScore lê o texto, separa afirmação por afirmação, e devolve o seu artigo remontado e marcado — você vê exatamente onde reescrever, e não só um número.

Ele mede **densidade factual**: a proporção de afirmações sustentadas por dado ou fonte — uma das alavancas que a pesquisa de **GEO** aponta como mais eficazes para visibilidade em motores generativos. Funciona com artigo, guia, tutorial e documentação — texto corrido, em português ou inglês.

<br>

## As três marcas

<table>
<tr>
<td width="33%" valign="top">

**───** &nbsp;`COM DADO OU FONTE`

Traz número, citação ou referência que dá para conferir.

</td>
<td width="33%" valign="top">

**- - -** &nbsp;`SEM FONTE`

Afirma um fato e não diz de onde ele vem. É aqui que se reescreve.

</td>
<td width="33%" valign="top">

**· · ·** &nbsp;`OPINIÃO`

Juízo de valor, marcado como tal. Não é defeito.

</td>
</tr>
</table>

A cor nunca é o único canal: cada categoria tem traço próprio, legível em escala de cinza, em daltonismo e em impressão preto e branco.

<br>

## Como funciona

```
  URL
   │
   ├─▶  busca ···············  IP privado bloqueado DENTRO do DNS
   ├─▶  extração ············  Readability separa o artigo do menu e do rodapé
   ├─▶  segmentação ·········  descarta título e fragmento sem verbo
   ├─▶  classificação ·······  LLM em lote · temperature 0
   └─▶  proporção ···········  divisão, não modelo
         │
         ▼
   o seu texto, marcado sentença a sentença
```

<br>

## O que ele encontra

Calibração sobre três artigos de referência do nicho:

```
┌──────────────────────────────────────────────────────────────────┐
│  3 artigos  ·  331 afirmações analisadas                         │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Ahrefs · meta tags     ███░░░░░░░░░░░░░░░░░   15% com fonte    │
│   Moz · o que é SEO      █████░░░░░░░░░░░░░░░   23% com fonte    │
│   MDN · introdução a JS  ████░░░░░░░░░░░░░░░░   21% com fonte    │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│  Afirmações SEM fonte      72%   ·   72%   ·   76%               │
└──────────────────────────────────────────────────────────────────┘
```

Três artigos, três autores, três tipos de texto — e em todos eles cerca de **3 em cada 4 afirmações factuais seguem sem fonte**. É esse padrão que o texto marcado expõe frase a frase, e é isso que dá para corrigir antes de publicar.

<sub>Percentuais da calibração de 2026-08-28, com <code>claude-haiku-4-5</code>. A versão atual fixa <code>temperature: 0</code> e o corpus não foi remedido desde então.</sub>

<br>

## Como ele ajuda no GEO

**Generative Engine Optimization** é a disciplina de fazer conteúdo ser encontrado e citado por motores generativos — ChatGPT, Perplexity, AI Overviews. A pesquisa da área já mediu quais mudanças de conteúdo têm mais efeito, e **acrescentar citações, estatísticas e referências a fontes está entre as de maior impacto**: o paper [*GEO: Generative Engine Optimization*](https://arxiv.org/abs/2311.09735) (KDD 2024), que introduziu o benchmark GEO-bench, reporta ganhos da ordem de 30% a 40% em algumas condições.

**É essa alavanca que o CiteScore trabalha** — e trabalha fundo. GEO tem várias frentes; o CiteScore escolheu a de maior impacto medido e não para num diagnóstico geral: devolve a lista exata das frases que precisam de fonte, que é onde a intervenção acontece.

A ligação entre densidade de fonte e citabilidade vem dessa pesquisa, não de uma medição nossa. O que o CiteScore mede no seu texto é a densidade — que é a parte sob o seu controle, e a que dá para corrigir hoje.

<br>

## Rodando localmente

Testado em **Node 20.20**.

```bash
npm install
cp .env.example .env.local     # preencha GEMINI_API_KEY
npm run dev
```

Abre em `http://localhost:3000`. A única variável obrigatória é a chave do provedor escolhido — todo o resto tem default.

O classificador roda sobre **Gemini** por padrão, porque tem cota gratuita real. Trocar para Claude é `LLM_PROVIDER=anthropic`: `ClaimClassifier` é uma porta, então o provedor é um adapter e não uma reescrita.

Em produção, `REDIS_URL` e `REDIS_TOKEN` passam a ser obrigatórias: a presença das duas é o que seleciona os adapters de produção, e sem elas o container falha alto de propósito em vez de rodar com contadores em memória que não sobrevivem a múltiplas instâncias.

<details>
<summary><strong>Todas as variáveis de ambiente</strong></summary>

<br>

| Variável | Default | Para que serve |
|---|---|---|
| `LLM_PROVIDER` | `gemini` | Quem classifica: `gemini` ou `anthropic` |
| `GEMINI_API_KEY` | — | **Obrigatória** com `LLM_PROVIDER=gemini` |
| `ANTHROPIC_API_KEY` | — | **Obrigatória** com `LLM_PROVIDER=anthropic` |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Qual modelo do Gemini usar |
| `ANTHROPIC_MODEL` | `claude-haiku-4-5` | Ponto único de troca de tier |
| `MAX_CONTENT_BYTES` | `2000000` | Teto de bytes baixados |
| `MAX_ANALYZABLE_SENTENCES` | `400` | Teto de sentenças analisadas |
| `MAX_SENTENCES_PER_LLM_CALL` | `80` | Tamanho do lote enviado ao LLM |
| `DAILY_BUDGET_USD` | `1.00` | Teto diário global |
| `MAX_REQUEST_BUDGET_USD` | `0.10` | Teto de uma análise |
| `MODEL_INPUT_USD_PER_MTOK` | `1.00` | Preço de entrada, por milhão de tokens |
| `MODEL_OUTPUT_USD_PER_MTOK` | `5.00` | Preço de saída, por milhão de tokens |
| `BUDGET_OUTPUT_RATIO` | `0.70` | Saída estimada como fração da entrada |
| `RATE_LIMIT_PER_HOUR` | `10` | Análises por hora, por cliente |
| `FETCH_TIMEOUT_MS` | `10000` | Timeout da busca |
| `MAX_REDIRECTS` | `3` | Redirecionamentos seguidos |
| `METHODOLOGY_URL` | `/#metodo` | Destino do link "Ler o método" |
| `REDIS_URL` | — | Upstash REST · obrigatória em produção |
| `REDIS_TOKEN` | — | Upstash REST · obrigatória em produção |

</details>

<br>

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm test` | Suíte completa · Vitest |
| `npm run lint` | ESLint 9, flat config |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run calibrate` | Pipeline completo sobre o corpus, com relatório por artigo |
| `npx tsx scripts/reprodutibilidade.ts` | Roda o mesmo artigo N vezes e compara |
| `npx tsx scripts/measure-extraction.ts` | Extração e segmentação sobre os fixtures |
| `npx tsx scripts/smoke-gemini.ts` | Uma chamada real ao Gemini, para provar a integração |

<br>

## Arquitetura

Hexagonal. O domínio não sabe que existe HTTP, Redis ou Anthropic.

```
src/
├── core/                    domínio puro — sem I/O, sem relógio, sem aleatoriedade
│   ├── domain/              tipos, invariantes, erros
│   ├── ports/               as interfaces que o domínio exige do mundo
│   ├── scoring/             fórmula e pesos, versionados
│   └── usecases/            orquestração do pipeline
│
├── adapters/                tudo que toca o mundo
│   ├── budget/              teto de gasto, com reserva e liquidação
│   ├── classify/            Anthropic + o detector de sinais
│   ├── extract/             Readability sobre jsdom ou linkedom
│   ├── fetch/               undici com validação de endereço no DNS
│   ├── ratelimit/  redis/   contadores fora do processo
│   ├── segment/  suggest/  clock/  config/
│
├── app/                     Next.js — a rota de API e a página
└── components/              React, e o modelo de apresentação SEM React
```

> [!TIP]
> **A fronteira não é convenção, é trava.** Uma regra de ESLint (`no-restricted-imports`) mais um teste de varredura estática impedem `core/` de importar de `adapters/`. Quebrar isso reprova o build, não uma revisão de código.

`src/components/report-model.ts` decide **o que** a tela pode exibir — sem React, testado sem DOM. O componente só desenha o que aquele modelo entrega.

<p align="center">
  <sub>Construído por <strong>Douglas Batista</strong></sub>
</p>
