---
created_at: 2026-08-27
updated_at: 2026-08-28
project_name: citescore
---

# Context Resume: CiteScore

> Leia este arquivo primeiro ao retomar o projeto. Ele reflete o estado atual, não o histórico — para o histórico, veja `session-log.md`.

## Project Summary

CiteScore é um web app de análise de conteúdo para SEO. O usuário informa a URL de um artigo e o sistema extrai o conteúdo principal, segmenta em sentenças e classifica cada uma em três categorias: afirmação com dado/fonte, afirmação sem fonte, ou opinião. A partir dessa distribuição calcula um **score de densidade factual**, apresentado como **estimativa** de citabilidade em motores de AI — nunca como citação medida. O v1 é análise avulsa: sem login, sem banco, sem histórico.

## Current Phase

**O produto funciona de ponta a ponta, localmente. Não pode ser publicado ainda.**

- **6 commits, versão 0.4.0**, working tree limpo salvo por estes artefatos.
- **A aplicação existe:** `POST /api/analyze` responde, e a tela em `/` aceita
  uma URL e renderiza o relatório. O placeholder de M1 morreu.
- **401 testes** passando; typecheck, lint e build verdes.
- **Verificado em uso real**, não presumido: `moz.com` analisado em 10,7s,
  score 17, US$ 0,0155.
- **M3 (UI final) segue bloqueado** — ver abaixo. A tela que existe é
  deliberadamente provisória.
- **M4 não começou**, e é ele que separa o projeto do deploy.

## ⛔ Por que ainda não dá para publicar

Um deploy hoje **falha no primeiro request, de propósito**. `AllowAllRateLimiter`
e `UnlimitedBudgetGuard` lançam sob `NODE_ENV=production` — a guarda
`assertNotProduction` existe justamente para impedir que as defesas de custo
sejam desligadas sem que ninguém perceba.

Três bloqueadores, todos de M4:

1. **Rate limiter com Upstash Redis** — OQ-2 já aprovada pelo usuário
2. **Budget guard com Upstash Redis**, teto de **US$ 1/dia** (aprovado)
3. **TOCTOU / DNS rebinding** — a última brecha de SSRF em aberto

Resolvidos os três, o deploy na Vercel deixa de ter impedimento técnico.

## ⚠️ Duas coisas que não podem ser esquecidas

**A premissa do motor caiu, e a correção não foi implementada.** O sistema foi
desenhado como híbrido, com meta de 50% dos casos resolvidos por regra. A
medição sobre 2.149 sentenças reais diz **0,3%**. O motor sempre foi LLM puro.
Está decidido ([ADR-006](../specs/decisions/006-prefiltro-deixa-de-decidir.md))
e **ainda não implementado** — é o change 002. Não bloqueia o deploy.

**Não reabra essa discussão sem dados novos.** Afrouxar a regra já foi medido:
a variante mais permissiva chega a 19,6% comprando cobertura com falso
positivo, porque `source_date` (17,4% das sentenças) carrega quase toda a
diferença — e data não é fonte.

**A chave da API não foi rotacionada.** Ela transitou por arquivo versionado de
repositório público numa sessão anterior. Nenhum commit publicado jamais a
conteve — verificado —, mas a rotação é a única forma de fechar o incidente, e
só o usuário pode fazê-la.

## O problema em aberto que mais importa

**A escala do score não discrimina.** Artigos de perfis deliberadamente
diferentes pontuaram 17, 23 e 24. A página do Moz, escolhida no golden dataset
como *"modelo de bom artigo SEO factual"*, tirou **17 de 100** na execução real
desta sessão.

A causa: a fórmula avalia densidade contra a escala teórica de 0 a 1, onde 1
significaria toda sentença do texto com fonte explícita. O valor típico medido
é **0,175**. É como medir altura humana numa régua de 0 a 3 metros — correta e
inútil.

**Os pesos não foram alterados**, e isso é deliberado: mexer neles com 3 artigos
repetiria o erro que criou o problema. O critério que vai decidir já está
escrito: **ordenação importa mais que amplitude**. Se artigo denso pontua acima
de artigo raso, o problema é de apresentação e tem solução barata; se não
pontua, o problema é da fórmula e é grave.

É isso que mantém M3 bloqueado, e é a OQ-3 que destrava.

## Sobre a tela que existe (e o que ela NÃO é)

A UI atual é **mínima e provisória, por decisão consciente**. Ela foi construída
respeitando o bloqueio de M3: nenhuma decisão de design foi tomada sobre a
apresentação do score. O que ela cumpre são os requisitos de **contrato** da
[ADR-004](../specs/decisions/004-honestidade-como-contrato.md), que não dependem
de direção visual:

- O score nunca aparece sem o breakdown das três categorias — garantido pelo
  **tipo** em `src/components/report-model.ts`, não por condicionais de JSX
- A ressalva de metodologia fica acima da dobra, antes de qualquer número
- "Densidade Factual" é o rótulo primário; "citabilidade" nunca rotula o número
- Estado `unscored` não renderiza métrica derivada alguma

**M3 continua aberto.** Design system, direção visual e a apresentação final do
score são trabalho do Designer, depois da OQ-3.

## Next Actions

1. **Rotacionar a chave da API.** Só você pode. Pendente desde o incidente.
2. **Rodada 3 — os três bloqueadores de deploy**: rate limiter e budget guard
   com Upstash Redis, e o TOCTOU. É o caminho mais curto até o link da Vercel.
3. **OQ-3: rodar o corpus completo** — 11 artigos, ~US$ 0,40. Dá base empírica
   à ADR-007 e **destrava M3**.
4. **Change 002** ([002-motor-llm-puro](../specs/changes/002-motor-llm-puro/)) —
   escopo fechado, não bloqueia deploy.
5. **`ClaudeSuggestionWriter`** — hoje o adapter é um no-op que devolve lista
   vazia. O prompt existe e nunca foi exercitado.
6. **Conferir o CSV** em `scripts/calibration/output/` — 331 sentenças
   classificadas, aguardando julgamento humano.

## O que já foi decidido — não re-litigar

| Decisão | Onde | Por quê, em uma linha |
|---|---|---|
| Arquitetura hexagonal | ADR-001 | Viabilizou a calibração sem rede e sem gastar |
| ~~Motor híbrido~~ → **LLM puro** | **ADR-006** | Medido: o pré-filtro resolve 0,3%, não 50% |
| Pré-filtro anota, não decide | **ADR-006** | Bug de regex deixa de poder mover o score |
| Fórmula do score (inalterada) | ADR-003 + **ADR-007** | Escala comprimida diagnosticada; pesos esperam dado |
| Honestidade como contrato de API | ADR-004 | Ressalva que vive só na UI morre no primeiro redesign |
| `claude-haiku-4-5` | ADR-005 | Escolha do usuário; custo real US$ 0,0155/artigo |
| Upstash Redis (free tier) | OQ-2 | Contador em memória não funciona em serverless |
| Teto de US$ 1/dia | usuário | Comporta ~65 análises com o custo real |
| Container instancia preguiçosamente | código | `next build` roda com `NODE_ENV=production` e derrubaria os adapters de dev |
| linkedom em vez de jsdom | medição | 3,6x mais rápido, saída equivalente em 6/7 |
| Texto de `article.content` | medição | `textContent` gruda sentenças |

## Requisitos que saem para o Designer (quando M3 destravar)

1. **Os `signals` NÃO explicam a decisão.** O LLM decide sem vê-los. Apresentar
   como "sinais encontrados no texto", jamais como "motivo da classificação" —
   afirmar causalidade inexistente colide com a ADR-004.
2. **A cobertura de sinais é ~28%.** A maioria das sentenças não terá nenhum, e
   a ausência precisa parecer normal, não defeito.
3. **Estado `unscored` não renderiza métricas derivadas.** Em dados
   inconsistentes o breakdown expõe números impossíveis de propósito, para
   diagnóstico.
4. **Duas ausências diferentes no texto destacado.** "Não analisável" (título,
   lista, fragmento) e "analisável, mas fora do limite de truncagem" não podem
   parecer a mesma coisa — rotular a segunda como a primeira atribui a ela uma
   razão falsa.

## Números de referência

| Métrica | Valor medido |
|---|---|
| **Custo por artigo (`claude-haiku-4-5`)** | **US$ 0,0155** — medido na rota real, 3x abaixo dos US$ 0,05 da calibração |
| Análises que cabem no teto de US$ 1/dia | ~65 |
| Duração de uma análise | ~10,7s para 100 sentenças analisáveis |
| Escalonamento ao LLM | **100%** (era meta de ≤50%) |
| Sentenças com algum sinal detectado | 28,2% |
| Distribuição em 331 sentenças | 17,5% SOURCED · 47,7% UNSOURCED · 34,7% OPINION |
| Prompt caching no haiku | **não funciona** — prefixo mínimo 4096, rubrica tem ~950 |

## Débito consciente, registrado e não escondido

- **"Disclaimer acima da dobra" não tem teste.** É requisito posicional e não há
  como verificá-lo sem navegador. A *presença* da ressalva no payload tem teste
  de contrato; a *posição* na tela não tem, e fica assim até M3.
- **`x-forwarded-for` é confiado sem verificação.** `clientKeyOf` em `route.ts`
  é o ponto único a endurecer, junto com o rate limiter real.
- **Mudanças de contrato pendentes de reconciliação** pelo Architect, todas
  listadas em `specs/changes/001-.../tasks.md`.

## Contexto externo

`docs/research/` traz três documentos gerados pela ferramenta `opencode` em
paralelo, incluindo o `golden-dataset-candidates`, de onde saiu o corpus.
**Ressalva descoberta em uso:** aquele documento contém URLs com data fictícia e
placeholders explícitos, escritos sem verificação. Só páginas pilares estáveis
foram aproveitadas — 11 de 12 responderam.
