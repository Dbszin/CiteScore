---
created_at: 2026-08-27
updated_at: 2026-08-28
project_name: citescore
---

# Session Log: CiteScore

Entradas novas são adicionadas no topo de `## Sessions`. Nunca sobrescrever entradas antigas.

## Sessions

### 2026-08-28 — O motor virou aplicação: rota, tela e primeiro uso real

- **Focus:** tirar o projeto do estado "motor sem aplicação". Até aqui o
  pipeline só rodava por script — não havia rota, caso de uso, container, e
  `src/app/page.tsx` era um placeholder. O usuário quer testar o produto e
  publicar na Vercel com link no LinkedIn.

- **Entregue e publicado** (commit `5669c75`, versão **0.4.0**):
  - `src/core/usecases/analyze-url.ts` — orquestrador do pipeline, todas as
    portas por injeção
  - `src/adapters/config/container.ts` — composição real, instanciação
    **preguiçosa**
  - `src/app/api/analyze/route.ts` + `error-status.ts` — `POST /api/analyze`,
    runtime `nodejs`, mapa exaustivo de código de erro para status HTTP
  - `src/components/analyzer.tsx` + `report-model.ts` — tela mínima funcional
  - `src/adapters/suggest/noop-suggestion-writer.ts` — ocupa o lugar do
    `ClaudeSuggestionWriter`, que ainda não existe
  - **401 testes** (eram 356); tsc, eslint e `next build` verdes

- **Primeiro uso real de ponta a ponta:** `moz.com/learn/seo/what-is-seo`
  respondeu 200 em 10,7s, score **17**, 175 sentenças / 100 analisáveis,
  breakdown 15 SOURCED · 65 UNSOURCED · 20 OPINION. Escalação ao LLM de 100%,
  confirmando a ADR-006 em produção.

- **O custo real caiu para um terço do estimado.** US$ **0,0155** por artigo
  (4.244 tokens de entrada, 2.261 de saída em `claude-haiku-4-5`), contra os
  US$ 0,05 da calibração — aquela medição incluía artigos maiores. O teto
  aprovado de US$ 1/dia passa a comportar ~65 análises, não ~20.

- **As guardas foram verificadas contra alvo real, sem gastar token:**
  `169.254.169.254` (metadata de nuvem) → 400 `BLOCKED_HOST`; home da Folha →
  422 `INDEX_PAGE`.

- **A armadilha do `NODE_ENV` era real e foi provada, não presumida.**
  `AllowAllRateLimiter` e `UnlimitedBudgetGuard` lançam sob
  `NODE_ENV=production`, e `next build` roda exatamente assim. Verificado em
  execução: importar `container.ts` em produção não faz nada; chamar
  `getAnalyzeUrl()` lança. É a instanciação preguiçosa que faz o build passar,
  e a guarda segue derrubando o primeiro request de um deploy sem Redis.

- **Obstáculo não previsto:** o build falhava com `Module not found`. O projeto
  importa com extensão `.js` em arquivos `.ts` — convenção que `tsc`, `vitest`
  e `tsx` entendem e o resolvedor do webpack não. Resolvido com
  `extensionAlias` no `next.config.ts`.

- **A lição desta sessão, e ela é sobre verificação:**
  Um **bug de especificidade de CSS passou por revisão de código**. A regra
  `.text mark { background: transparent }`, de especificidade (0,1,1), vencia
  as regras `.cat-*`, de (0,1,0). Todo destaque no texto ficava sem fundo —
  enquanto a **legenda**, que usa outro seletor e não colidia, mostrava as
  cores normalmente. A tela não parecia quebrada: parecia uma decisão de
  design. E o destaque inline é o recurso P0 que torna o resultado acionável.

  O bug entrou por leitura de código e só sairia por execução. A correção veio
  acompanhada de um teste que resolve a cascata com `jsdom` — e, antes de
  corrigir, foi **confirmado que esse teste REPRODUZ o bug na versão antiga**.
  Um oráculo que sabe falhar vale; um que só passa depois da correção não
  prova nada.

  Vale ao lado do outro padrão já registrado neste projeto: os três bugs de
  regex das tabelas de sinais, todos achados por teste e nenhum por leitura.

- **Revisão: 1 crítico e 8 avisos; 7 corrigidos.** Além do CSS:
  - `INTERNAL_ERROR` escapava da união fechada dentro de um objeto anônimo que
    não passava por tipo nenhum. Virou tipo separado — **não** foi acrescentado
    a `AnalysisErrorCode`, porque aquela união enumera o que o produto sabe
    tratar e o 500 é exatamente o que ele não sabe
  - "Não analisável" e "não coube no limite de análise" renderizavam
    idênticas, e a legenda atribuía à segunda uma razão falsa. Agora são
    estados distintos
  - O invariante score+breakdown da ADR-004 dependia de dois condicionais
    independentes no JSX. Passou a ser garantido pelo **tipo**, em
    `report-model.ts` — sem React, e testado sem ambiente de DOM
  - Falha de `countTokens` derrubava a análise inteira por um número que o
    guard atual descarta. Agora degrada para aproximação conservadora, que
    nunca é zero

- **Mudanças de contrato registradas como débito** (em `tasks.md`):
  `AnalyzeUrlDeps.config`, `ClaimClassifier.estimateInputTokens` (opcional),
  `AnalysisError.retryAfterSeconds`, e o `extensionAlias`.

- **Débito assumido conscientemente, não escondido:**
  - "Disclaimer acima da dobra" **não tem teste**. É requisito posicional e não
    há como verificá-lo sem navegador. A *presença* da ressalva no payload tem
    teste de contrato; a *posição* na tela não tem
  - `x-forwarded-for` é confiado sem verificação — endurece na rodada 3, junto
    com o rate limiter real

- **Next:** os três bloqueadores de deploy (rate limiter e budget guard com
  Upstash Redis, TOCTOU/DNS rebinding). E, ainda pendente do usuário desde o
  incidente da sessão anterior: **rotacionar a chave da API**.

### 2026-08-28 — A calibração derrubou a premissa central do motor

- **Focus:** executar o acceptance criteria de M2 — rodar o pipeline sobre
  artigos reais e responder se a classificação é boa. A resposta veio, e
  invalidou a arquitetura do motor.

- **O achado que define esta sessão:**
  - **O pré-filtro determinístico resolve 0,3% dos casos.** A meta da ADR-002
    era 50%. A taxa de escalonamento ao LLM medida foi de **100%** em todos os
    artigos. O motor híbrido nunca foi híbrido na prática.
  - Medição sobre **2.149 sentenças analisáveis de 11 artigos reais**:
    `source_attribution` aparece em **0,4%** das sentenças, e
    `opinion_first_person` em **zero**.
  - **Por que falhou:** a regra exigia a CONJUNÇÃO de atribuição com
    quantidade ou data na mesma sentença. Quando um dos termos ocorre em 0,4%
    dos casos, a conjunção é matematicamente quase impossível — em prosa real
    a fonte está numa frase e o número em outra.
  - **A raiz do erro de projeto:** a ADR-002 foi escrita a partir de sentenças
    de EXEMPLO. Sentenças de exemplo contêm marcadores explícitos porque foram
    escritas para contê-los. Prosa real não.

- **Key decisions:**
  - **ADR-006 — o pré-filtro deixa de decidir e passa a anotar.** O LLM assume
    a decisão que já tomava. As tabelas de sinais ficam como fonte de
    explicabilidade: hoje `Classification.signals` está vazio em 100% das
    classificações reais, porque só a decisão por regra o populava. Ganho de
    risco: um bug de regex deixa de poder mover o score.
  - **Afrouxar a regra foi medido e rejeitado.** A variante mais permissiva
    chega a 19,6%, mas `source_date` carrega quase toda a diferença — e data
    não é fonte. Compraria cobertura produzindo exatamente o erro que a
    ADR-002 define como o pior possível.
  - **ADR-007 — a escala do score mede contra um teto inalcançável.** Artigos
    de perfis distintos pontuaram 17, 23 e 24. A página do Moz, escolhida no
    golden dataset como "modelo de bom artigo SEO factual", tirou **24 de
    100**. A fórmula avalia densidade contra a escala teórica de 0 a 1, onde 1
    significa toda sentença com fonte; o valor típico medido é 0,175.
  - **Os pesos NÃO foram alterados.** Mexer neles com 3 artigos repetiria o
    erro que criou o problema: escolher constante sem dado. Ficou registrado o
    critério que decide — **ordenação importa mais que amplitude**.
  - **ADR-005 corrigida:** custo real de **US$ 0,05 por artigo**, 7x acima da
    projeção, que assumia uma economia de 50% inexistente.

- **Outcomes:**
  - Três commits publicados; versão **0.3.0**. Total de 5 commits.
  - `scripts/calibrate.ts` entregue, com teto de custo que **funcionou**:
    abortou ao detectar um artigo 15x acima da estimativa, tendo gasto US$ 0,15
    de US$ 0,50 autorizados.
  - CSV com 331 sentenças classificadas disponível para conferência manual.
  - Change 002 (`002-motor-llm-puro`) especificado e **não implementado**.
  - 356 testes passando; typecheck, lint e build verdes.
  - Antes disso, na mesma sessão: o classificador LLM foi implementado, e um
    bug que produzia **score 130 numa escala de 0 a 100** foi encontrado pela
    revisão e corrigido em três camadas antes de qualquer publicação.

- **Next steps:**
  - **Rotacionar a chave da API** — segue pendente desde o incidente.
  - Implementar o change 002.
  - **OQ-3: rodar o corpus completo** (~US$ 0,40) para dar base empírica à
    ADR-007 e destravar M3.
  - M3 permanece **bloqueado**: a escala pode mudar.

### 2026-08-28 — Incidente de segredo + desbloqueio de M2

- **Focus:** ao fim da sessão, ao atualizar os artefatos de longo prazo, foi
  detectada uma chave de API real em arquivo versionado.

- **O que aconteceu:**
  - Uma `ANTHROPIC_API_KEY` real foi colada em `.env.example` — o arquivo
    **template, versionado**. O arquivo correto seria `.env.local`, que está
    no `.gitignore`. Junto veio a troca de `ANTHROPIC_MODEL` para
    `claude-haiku-4-5`.
  - **A chave NÃO foi comitada nem publicada.** Verificado com
    `git show HEAD:.env.example`: o commit `7d69fa7` tem o campo vazio. A
    exposição ficou restrita ao working tree local.
  - O risco era concreto e iminente: o repositório é **público**, e o passo
    seguinte previsto era o Shipper comitar os artefatos atualizados — o que
    levaria a chave junto. Bots varrem o GitHub por padrões `sk-ant-` em
    segundos.

- **Ação tomada:**
  - `.env.local` criado com os valores reais (arquivo ignorado pelo git).
  - `.env.example` restaurado ao template sem valores, byte a byte idêntico
    ao commit publicado.
  - Confirmado que `git status` não lista mais `.env.example`.

- **Pendência que fica:**
  - **Rotacionar a chave por precaução.** Ela transitou por um arquivo
    versionado e apareceu em texto plano no transcrito da sessão, ao ser
    investigada. Nada indica vazamento, mas rotacionar é barato e a
    alternativa é confiar que nada deu errado.

- **Decisão de produto embutida no incidente:**
  - **OQ-1 respondida: `claude-haiku-4-5`.** ~US$0,026 por análise, 5x mais
    barato que `claude-opus-5`. O default do código segue `claude-opus-5`; a
    escolha vive em `.env.local`, que é o ponto único previsto pela ADR-005.
  - **M2 está desbloqueado.** O classificador LLM e a calibração podem
    começar.

### 2026-08-28 — M1 completo, M2 parcial, primeiro commit publicado

- **Focus:** executar o ciclo CrewLoop completo a partir das especificacoes:
  Architect escreve as specs, Engineer implementa, Reviewer audita, Shipper
  publica. Sessao iniciada em 2026-08-27 e concluida em 2026-08-28.

- **Key decisions:**
  - **Arquitetura hexagonal (ADR-001)** — escolhida porque o marco de maior
    risco (M2) exige centenas de execucoes sobre corpus real; sem portas,
    cada execucao custaria rede e dinheiro. A arquitetura existe para
    viabilizar a calibracao, nao por preferencia estetica.
  - **Motor hibrido (ADR-002)** — o pre-filtro decide apenas dois casos de
    alta confianca. `UNSOURCED` NUNCA e decidido por regra, porque e a
    categoria acionavel do produto: errar nela e errar no que o usuario vai
    ler e agir. Meta de escalonamento ao LLM: <= 50%.
  - **Formula do score criada de zero (ADR-003)** — ela nao existia antes
    desta sessao. `CiteScore = round(100 * (0,6 * FD + 0,4 * (1 - GAP)))`,
    com `FD = sourced/N` e `GAP = unsourced/(sourced+unsourced)`. Opiniao
    DILUI a densidade mas nao penaliza, para nao empurrar o usuario a
    produzir texto sem voz. Ausencia de score e estado proprio, nao zero.
  - **Honestidade do score virou CONTRATO (ADR-004)** — `disclaimer`,
    `scoreVersion` e `methodology` sao campos obrigatorios do payload, com
    teste que falha se ausentes. Ressalva que vive so na UI morre no
    primeiro redesign, e o produto passa a afirmar algo que nunca mediu sem
    ninguem ter decidido mentir.
  - **Modelo `claude-opus-5`, ~US$0,13 por analise (ADR-005)** — e a
    descoberta contra-intuitiva: a SAIDA domina 92% do custo, entao prompt
    caching, primeiro reflexo de quem otimiza LLM, rende aqui apenas ~10%.
    Os levers que movem o numero sao todos do lado da saida.
  - **linkedom adotado contra jsdom, por medicao** — 3,6x mais rapido
    (85ms vs 304ms por pagina), 2,3x menor em disco, saida equivalente em
    6 de 7 fixtures. A primeira medicao deu 7/7 FALHAS, mas investigar
    antes de concluir revelou bug do proprio codigo (`parseHTML` num
    fragmento deixa `body` vazio), nao limitacao da biblioteca.
  - **`links/palavra` DESCARTADO como sinal** — os dados contradisseram a
    hipotese: a Wikipedia, conteudo legitimo e o mais denso em fonte do
    corpus, tem 0,316, quase o DOBRO da home da Folha (0,172). O sinal
    produziria falso positivo justo nas paginas que o produto quer premiar.
    Criterio final: razao de sentencas analisaveis < 0,35, calibrado em 7
    paginas reais.
  - **Texto derivado de `article.content`, nunca de `article.textContent`**
    — o Readability concatena blocos sem separador ("visitors.Every") e o
    `Intl.Segmenter` nao quebra isso, propagando o erro em silencio para
    classificacao, score e highlight.
  - **Charset declarado passou a ser respeitado** — site PT-BR em latin-1
    gerava mojibake, corrompendo exatamente as tabelas de sinais
    acentuadas. O mercado primario e brasileiro.

- **Outcomes:**
  - **Primeiro commit do projeto publicado:** `7d69fa7` em `origin/main`,
    118 arquivos, 18.194 insercoes. O repositorio saiu de zero commits.
  - **M1 completo**, gate verificado: build passa, `npm run dev` responde
    HTTP 200, e a regra de pureza do core tem teste que a EXERCITA em vez
    de assumir que funciona.
  - **M2 parcial:** extracao, segmentacao, scoring e pre-filtro de regras.
  - **297 testes**, 282 dos quais rodam em clone limpo.
  - **Duas rodadas de revisao.** A primeira encontrou 2 criticos e 2 altos;
    a segunda aprovou com 2 achados menores.
  - **Cinco bugs achados por TESTE, nenhum por leitura:**
    (a) o `\b` no fim do padrao de quantidade nunca casa depois de `%`, o
    que tornava percentual — o sinal de fonte mais comum em SEO —
    invisivel; (b) padrao de atribuicao sem flag de caixa, entao "Segundo o
    IBGE" no inicio de frase nao casava; (c) `\d{1,3}` exigindo separador
    de milhar, entao "1200%" nao casava; (d) FALSO POSITIVO CONFIANTE — "No
    Segundo Trimestre de 2024" era `SOURCED` por regra, confianca 0,92, sem
    fonte alguma; (e) a propria suite reportava verde em clone limpo com 16
    testes silenciosamente ignorados.
  - Tres bugs consecutivos no mesmo arquivo deixaram de ser azar e viraram
    sinal: as tabelas de sinais ganharam bateria sistematica de 76 casos.

- **Next steps:**
  - **Desbloquear `ANTHROPIC_API_KEY`** — sem ela nao ha classificador LLM
    e portanto nao ha calibracao, que e o acceptance criteria de M2.
  - Decidir **OQ-1** (tier do modelo, fator 5x de custo) e **OQ-2**
    (dependencia de Redis para M4).
  - Corrigir o **teste de meta-cobertura inerte** antes de M2 fechar.
  - Usar `docs/research/golden-dataset-candidates-2026-08-27.md`, que ja
    tras a lista curada de URLs para a validacao manual.
  - Comitar estes artefatos atualizados (Shipper).

### 2026-08-27 — Discovery inicial e definição de escopo do v1

- **Focus:** Primeira sessão do projeto. Repo vazio (zero commits). Transformar a ideia "Content Factual Density Analyzer" em escopo de v1 rastreável.

- **Key decisions:**
  - **Citabilidade em AI = score heurístico (proxy), não medição real.** Decisão consciente após confronto explícito das duas alternativas. Medição real em ChatGPT/Perplexity/AI Overviews fica no roadmap. Consequência: a UI é obrigada a rotular o score como estimativa.
  - **Usuário primário do v1:** marketer / SEO in-house analisando o conteúdo do próprio site.
  - **Entrada apenas por URL única.** Texto colado, upload de arquivo e análise em lote ficam fora do v1.
  - **Motor híbrido:** pré-filtro determinístico (números, datas, unidades, links de fonte, hedging) + LLM nos casos ambíguos. Escolhido em vez de LLM puro (custo) e de regras puras (raso demais).
  - **Sem login, sem banco, sem histórico.** Análise avulsa para chegar ao ar rápido e validar demanda.
  - **Output completo:** score + breakdown por categoria + highlight inline por sentença + sugestões de melhoria por sentença.
  - **Stack:** Next.js + TypeScript. LLM assumido como Claude API (assunção registrada, não contestada pelo usuário).
  - **Ritmo:** multi-sessão, com prazo "o quanto antes" — datas-alvo agressivas de ~3 semanas.
  - **Marcos com risco primeiro:** o motor de análise (M2) vem antes da UI, para que a falha do classificador seja descoberta na primeira semana e não na quarta.

- **Outcomes:**
  - Brief de escopo aprovado pelo CrewLoop Hub após 3 rodadas de discovery (11 decisões capturadas).
  - Dois riscos levantados e registrados para a arquitetura resolver: abuso/custo de LLM em endpoint público sem auth, e honestidade da afirmação de correlação com citabilidade.
  - Criados os quatro artefatos de acompanhamento multi-sessão em `docs/`.
  - Nenhum código escrito. Nenhum commit feito.

- **Next steps:**
  - Architect escreve as specs em `specs/changes/` — obrigatório antes de qualquer código.
  - Architect decide: framework de UI, estratégia de extração de conteúdo, desenho do pré-filtro determinístico, provider de deploy, e o mecanismo de rate limiting / budget guard.
  - Depois das specs: Designer para a direção visual do relatório (inclui a copy de honestidade do score).
  - Shipper deve comitar `docs/` junto com o primeiro commit do projeto.
