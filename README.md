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

**E quando ele mede só parte da página, ele diz.** Título, item de lista curto e fragmento sem verbo não são afirmações, e ficam fora da conta. Se sobrar menos da metade dos blocos, a tela avisa com os números — *"classificamos 38 dos 94 blocos (40%); as proporções descrevem a parte classificada, não a página inteira"*. O limiar veio de medição: os artigos do corpus ficam entre 0,545 e 0,667 de blocos analisáveis, e as landing pages que escorregam pela guarda ficam entre 0,397 e 0,463.

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

Corpus de referência, medido pelo pipeline completo com o classificador atual:

```
┌───────────────────────────────────────────────────────────────────────┐
│  artigo                      tipo de texto        c/fonte   composto  │
├───────────────────────────────────────────────────────────────────────┤
│  Moz · o que é SEO           pilar de marketing        2%        2    │
│  MDN · introdução a JS       documentação técnica     10%       10    │
│  Ahrefs · canonical tags     post curto               11%       13    │
│  Wikipedia · Transformer     artigo científico        47%       47    │
│  Wikipedia · lista de PIB    tabela com fontes        67%       67    │
└───────────────────────────────────────────────────────────────────────┘
```

Dois achados, e o segundo é o que importa para quem escreve.

**Conteúdo de marketing quase não cita.** Nos três primeiros, entre 84% e 98%
das afirmações factuais seguem sem fonte. Mesmo um post que cita de verdade
deixa 4 em cada 5 penduradas.

**E a medida separa tipos de texto.** Um artigo científico da Wikipedia tira 47,
uma tabela de PIB com referências tira 67, uma página pilar de SEO tira 2. A
ordem apareceu sozinha: ninguém calibrou peso para produzi-la.

> [!NOTE]
> **Esta tabela corrige uma medição anterior que estava inflada**, e a correção
> vale ser contada.
>
> A calibração de agosto usava `claude-haiku-4-5` e encontrava 21-23% de
> afirmações com fonte em todo artigo — quatro pontos separando textos
> deliberadamente diferentes. A divergência foi investigada sentença por
> sentença, e o classificador antigo estava **contando menção a entidade nomeada
> como se fosse atribuição**: chamava de "com fonte" frases como *"MozBar: a
> browser extension showing SEO metrics"* ou *"Loading performance is how fast
> your page content appears (Largest Contentful Paint)"*. O parêntese é um nome,
> não uma referência.
>
> Como o erro acontecia em qualquer texto, ele empurrava todos os artigos para a
> mesma faixa — e a conclusão de que "a régua não discrimina" era efeito dele,
> não da fórmula.
>
> **Ressalvas honestas:** cinco artigos, não onze — a cota gratuita do provedor
> acabou no meio da execução, e os textos em PT-BR ficaram de fora. E
> `temperature: 0` reduz a variação entre execuções sem eliminá-la: o MDN deu
> 6% numa medição e 10% noutra.

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

O classificador roda sobre **Gemini** por padrão, porque tem cota gratuita. Trocar para Claude é `LLM_PROVIDER=anthropic`: `ClaimClassifier` é uma porta, então o provedor é um adapter e não uma reescrita.

> [!IMPORTANT]
> **Quanto a cota gratuita dá, medido.** O cabeçalho de cota da própria API do Gemini reporta `GenerateRequestsPerDayPerProjectPerModel-FreeTier = 20` — vinte requisições por dia, por modelo. Uma análise de artigo típico consome duas (o classificador manda em lotes de 80 sentenças), então são **cerca de 10 análises por dia**.
>
> Isso basta para desenvolver e, com a vitrine semeada, para uma demonstração pública. Não basta para tráfego sustentado. O Claude não tem free tier, mas com o teto padrão de US$ 1/dia rende cerca de 64 análises — a escolha é entre custo zero e volume.

Em produção, `REDIS_URL` e `REDIS_TOKEN` passam a ser obrigatórias: a presença das duas é o que seleciona os adapters de produção, e sem elas o container falha alto de propósito em vez de rodar com contadores em memória que não sobrevivem a múltiplas instâncias.

### Vitrine e cache

Duas coisas fazem a cota render, e as duas usam o mesmo mecanismo:

- **Cache por URL**, compartilhado entre todos os visitantes. A mesma URL analisada duas vezes paga uma. Um botão *"Analisar de novo"* ignora o guardado, para quem editou o texto e voltou conferir.
- **Vitrine**: `npx tsx scripts/semear-vitrine.ts` mede os artigos em destaque uma vez e os guarda com prazo de 30 dias. Eles passam a responder em milissegundos sem gastar requisição, deixando a cota inteira para quem traz um texto próprio.

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

## O que ele guarda

Curto, porque é curto de verdade.

- **A análise fica no Redis por 24 horas**, com a URL na chave — 30 dias nos artigos em destaque. É o que faz a mesma URL não ser paga duas vezes.
- **Nada sobre quem pediu é armazenado.** Não há conta, não há sessão, e o IP serve só para o limite de 10 por hora, num contador que expira.
- **A URL que você envia não vai para o log.** Nem na mensagem de erro, nem na pilha. Isso é código com teste, não combinado: erro de rede costuma trazer o endereço na mensagem, e uma biblioteca atualizada pode passar a trazer onde antes não trazia.
- **Nome, mensagem e pilha dos erros continuam sendo registrados**, filtrados. Falha em produção sem log é falha que ninguém conserta.

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
| `npx tsx scripts/semear-vitrine.ts` | Semeia os artigos em destaque no cache, com prazo longo |

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
