# Tasks: Analisador de Densidade Factual (v1)

Checklist ordenado. A ordem é a de `design.md` § Estratégia de Implementação e não é arbitrária: portas antes de adapters (viabiliza paralelização), motor antes de UI (o risco primeiro), guardas antes de deploy.

## Setup

- [x] Criar estrutura de `specs/`
- [x] Inicializar `.spec.yaml`
- [x] Escrever ADRs 001–005
- [x] Escrever `proposal.md`, `design.md` e os 6 spec deltas
- [ ] Long-Term Manager atualizar `docs/progress-checklist.md` marcando "Especificações escritas pelo Architect" como `done`

---

## ✅ RECONCILIAÇÃO PARCIAL (2026-08-28) — pelo Architect

O Architect revisou o débito acumulado à luz da calibração. Resultado:

- **Reconciliado por ADR nova:** o motor híbrido (ADR-002 superseded em parte
  por [ADR-006](../../decisions/006-prefiltro-deixa-de-decidir.md)), a escala
  do score (ADR-003 emendada por
  [ADR-007](../../decisions/007-escala-do-score.md)) e o custo/superfície de
  API (nota de atualização na ADR-005).
- **Migrado para o change 002:** tudo que dependia do pré-filtro decisório —
  incluindo o ramo "link externo + atribuição", que deixa de importar porque
  não há mais decisão por regra.
- **Ainda pendente aqui:** os itens de extração e de contrato listados abaixo,
  que continuam válidos e não foram tocados pela calibração.

Ver [002-motor-llm-puro](../002-motor-llm-puro/).

## ⚠️ DÉBITO DE SPEC — pendente de reconciliação pelo Architect

O usuário optou por corrigir no código em vez de revisar a spec primeiro
(decisão consciente, tomada em 2026-08-27 com o custo declarado). As decisões
abaixo **existem no código e nos testes, mas NÃO estão refletidas nas ADRs nem
em `specs/extracao/spec.md`**. Enquanto isso não for reconciliado, a spec de
extração está desatualizada.

- [ ] **Texto vem de `article.content`, não de `article.textContent`.** Motivo
      medido: o Readability concatena blocos sem separador ("visitors.Every"),
      e o `Intl.Segmenter` não quebra isso. Implementado em
      `src/adapters/extract/html-text.ts`.
- [ ] **Dois códigos de erro novos**, ausentes da união original em
      `design.md`: `ACCESS_FORBIDDEN` (401/403 — o paywall duro falha no fetch,
      não na extração) e `INDEX_PAGE` (home/listagem produz lixo plausível).
- [ ] **Guarda de página-índice** por razão de sentenças analisáveis, limiar
      0.35, em `src/core/domain/index-page-guard.ts`. Calibrado sobre os 7
      fixtures reais. **`MIN_ANALYZABLE_SENTENCES = 10` não pegava a home da
      Folha** com a intenção correta.
- [ ] **`links/palavra` foi DESCARTADO como sinal**, contra a hipótese inicial:
      a Wikipedia (conteúdo legítimo) tem a maior densidade de links do corpus,
      0.316, quase o dobro da home da Folha, 0.172. O sinal produziria falso
      positivo nas páginas mais densas em fonte.
- [ ] **linkedom adotado como parser default**, agora com medição: saída
      equivalente ao jsdom em 6/7 fixtures (MDN com 1,2% de variância), 3,6x
      mais rápido (85ms vs 304ms por página) e 2,3x menor (1,8MB vs 4,1MB).
      Ambos os parsers seguem testados em paralelo.
- [ ] **`ContentShape` acrescentado a `ExtractedContent`** para carregar os
      sinais estruturais que a guarda de índice usa.
- [ ] **Campo `truncated` acrescentado a `Analysis`** (cap de sentenças).
- [ ] **Dois bugs de regex encontrados por teste**, ambos com impacto de
      produto: (a) o `\b` no fim do padrão de quantidade nunca casa depois de
      `%`, então **percentual — o sinal de fonte mais comum em SEO — jamais era
      detectado**; (b) o padrão de atribuição não tinha flag de caixa no
      conector, então "Segundo o IBGE" no início de frase não casava.
- [ ] **`no_verb` foi restringido** a fragmento SEM pontuação terminal. A
      versão inicial excluía sentenças legítimas ("O consumo das famílias
      reagiu rápido.") por não casarem com uma lista finita de verbos.

### Rodada de correção pós-revisão (2026-08-27)

Mudanças de contrato e de comportamento feitas para resolver os achados do
Reviewer. Também ainda não refletidas nas ADRs:

- [ ] **Novo `SignalKind`: `attribution_disqualifier`.** Anula uma atribuição
      que casou por engano. Criado para o falso positivo confiante: "No
      Segundo Trimestre de 2024" era `SOURCED` por regra, sem fonte. A regra
      é gramatical — em português a preposição "segundo" nunca é precedida
      de artigo.
- [ ] **Ramo "link externo + atribuição" REMOVIDO do `strongSource`.** Nunca
      teve produtor, era inalcançável. A ADR-002 ainda o lista como caminho
      de decisão. Reintroduzir exige que a extração emita os offsets dos
      links no texto normalizado — trabalho real, não trivial.
- [ ] **Campo `externalDomains` REMOVIDO de `ExtractedContent`** (era
      coletado e nunca lido) e `'caption'` removido de `ExclusionReason`
      (nunca era atribuído).
- [ ] **`MIN_ANALYZABLE_RATIO` e `MIN_SENTENCES_FOR_RATIO` movidos para
      `scoring/weights.ts`**, sob o mesmo regime de versionamento dos pesos:
      mudá-los muda quais páginas recebem score, então exige incrementar
      `SCORE_VERSION`.
- [ ] **Decodificação passou a respeitar o charset declarado**
      (`adapters/fetch/charset.ts`), com precedência header → `<meta>` →
      UTF-8. Antes era `toString('utf8')` incondicional, o que gerava
      mojibake em site PT-BR com latin-1 e corrompia as tabelas de sinais
      acentuadas.
- [ ] **`isBlockedAddress` passou a FALHAR FECHADA** e reconhece IPv4-mapeado
      em forma hexadecimal — que é a forma que o parser de URL realmente
      produz. Acrescentadas as faixas 192.88.99.0/24 e 198.18.0.0/15.
- [ ] **Timeout do fetch virou deadline TOTAL**, não por requisição.
- [ ] **`assertNotProduction`**: os adapters de dev agora lançam se
      construídos com `NODE_ENV=production`. Antes a proteção era só um
      comentário.
- [ ] **Fixtures mínimos versionados** em `tests/fixtures/html-min/` (~7 KB)
      e `CI=true` passou a FALHAR quando os fixtures grandes faltam. Antes,
      clone limpo rodava 136 testes e reportava verde; agora roda 282, e em
      CI a ausência é erro visível.

### Rodada do classificador LLM (2026-08-28)

A **ADR-005 precisa de reconciliação**: ela especificou parâmetros de API que
não se aplicam à configuração real. Três descobertas, todas verificadas em
execução:

- [ ] **`output_config.effort: "low"` não é enviado.** Dois motivos
      independentes: `effort` retorna erro em `claude-haiku-4-5` (o tier
      escolhido em OQ-1), **e** o SDK instalado (`@anthropic-ai/sdk` 0.70.1)
      não expõe `effort` de forma alguma. A ADR assumia `claude-opus-5` e um
      SDK mais recente.
- [ ] **Thinking adaptativo não é enviado.** O SDK 0.70.1 só oferece
      `enabled`/`disabled`, sem `adaptive`. Para classificação em lote, sem
      thinking é o desejável — mais barato e mais rápido.
- [ ] **Structured output vive em `client.beta.messages.parse` com o
      parâmetro `output_format`**, não em `client.messages.parse` com
      `output_config.format`.
- [ ] **O helper `betaZodOutputFormat` do SDK é inutilizável aqui:** chama
      `z.toJSONSchema()`, que só existe no Zod 4, e o projeto usa Zod 3.25.x.
      O JSON Schema vai explícito em `schemas.ts`, com teste garantindo que
      não divirja do schema Zod que valida a resposta.
- [ ] **A API rejeita `minimum`/`maximum` em campo `number` do JSON Schema**
      (400: "properties maximum, minimum are not supported"). Descoberto na
      verificação real — o teste com stub não pegaria, porque stub não valida
      o schema enviado. A faixa 0..1 de `confidence` continua garantida pelo
      Zod na resposta.
- [ ] **Prompt caching NÃO funciona com `claude-haiku-4-5`.** O prefixo
      mínimo cacheável é de 4096 tokens nesse modelo — o maior da tabela,
      contra 512 no `claude-opus-5` — e a rubrica tem ~950 tokens. Confirmado
      na verificação real: `cache_creation_input_tokens: 0`. O
      `cache_control` continua sendo enviado porque passa a valer sozinho se
      o tier subir; inflar a rubrica para cruzar 4096 seria pagar mais
      entrada para economizar entrada.
- [ ] **`model-capabilities.ts` é novo** e documenta as diferenças de
      superfície entre modelos, com default conservador para modelo
      desconhecido. Não está em nenhuma ADR.
- [ ] **`HybridClassifier.escalationRate()` é novo:** mede a taxa de
      escalonamento da ADR-002 sem gastar nada, porque o pré-filtro é
      determinístico. É o que torna a calibração de M2 viável antes de
      qualquer chamada paga.
- [ ] **Custo real medido está MUITO abaixo da estimativa da ADR-005.**
      Verificação de 4 sentenças com `claude-haiku-4-5` (3 escaladas ao LLM):
      1.018 tokens de entrada, 75 de saída, **US$ 0,001393**, 2,4s.
      Extrapolando para artigo típico (80 sentenças analisáveis, 50%
      escalando): entrada ~1.950, saída ~1.000, **≈ US$ 0,007 por análise**.
      A ADR-005 projetava US$ 0,026 para o haiku — o real é ~3,7x menor,
      porque a projeção incluía thinking (que o haiku não tem), justificativa
      por sentença (removida) e a chamada de sugestões (ainda não
      implementada). Número medido, não estimado.

### Correção do score fora da escala (2026-08-28)

Achado crítico da terceira revisão, comprovado por execução: id duplicado na
resposta do modelo produzia **densidade factual de 150% e score 130** numa
escala de 0 a 100. Três camadas falharam; a correção cobre as três.

- [ ] ⚠️ **MUDANÇA DE CONTRATO — precisa de reconciliação pelo Architect:**
      `UnscoredReason` ganhou o valor **`INCONSISTENT_INPUT`**. A ADR-003
      define apenas `INSUFFICIENT_CONTENT` e `NO_CLAIMS_FOUND`. O novo estado
      existe porque a aritmética do score pressupõe no máximo uma
      classificação por sentença analisável, e o pipeline podia violar isso.
      Sem um estado próprio, a alternativa seria emitir score sem sentido ou
      lançar de dentro de uma função pura.
- [ ] **Invariante em `computeScore`:** se
      `sourced + unsourced + opinion > analyzableCount`, não emite score.
      Fica na função pura de propósito — é a única barreira que protege
      independentemente de qual camada acima erre. Menos classificações que
      `N` continua aceito; mais, nunca.
- [ ] **Dedup no `ClaudeClassifier`:** `Set` de índices já vistos, mantendo a
      primeira ocorrência. Antes só validava se o índice pertencia ao lote,
      não se já havia aparecido.
- [ ] **`renderBatch` passou a numerar com índices LOCAIS `0..N-1`** por
      lote, com tradução de volta ao id de domínio pela posição. A versão
      anterior usava o id global do documento (podia ser 380, esparso), o que
      aumentava a chance de o modelo errar o eco — a causa raiz. Trata a
      origem, não só o sintoma.
- [ ] **`toDomainError` foi simplificada de 24 linhas para 1.** Tinha sete
      ramos `instanceof` que produziam todos o mesmo código, sob um comentário
      afirmando preservar a distinção entre falha retentável e não retentável.
      O código não preservava. **Pendência para o Architect:** decidir se o
      produto precisa de um código de erro retentável — hoje não há consumidor
      que decida retry a partir dessa informação.
- [ ] **`max_tokens` passou a ser derivado** de `maxSentencesPerCall`
      (`deriveMaxTokens`), em vez de fixo em 8.000. Com o lote em 400 a saída
      precisaria de ~16.500 tokens e seria truncada, gerando
      `CLASSIFIER_INVALID_OUTPUT` que aponta para a causa errada.
- [ ] **`cacheIsEffective` ganhou consumidor:** o smoke mede a rubrica
      (~702 tokens medidos) e informa que ela fica abaixo do prefixo mínimo do
      modelo. Antes era método público sem uso.

### Rodada da aplicação utilizável (2026-08-28)

O motor passou a ser alcançável por HTTP e por tela. Quatro decisões de
implementação divergem do que `design.md` especifica e precisam de
reconciliação:

- [ ] ⚠️ **MUDANÇA DE CONTRATO — `AnalyzeUrlDeps` ganhou o campo `config`**
      (`methodologyUrl`, `model`, `maxAnalyzableSentences`). O contrato em
      `design.md` § API Contracts não previa de onde o caso de uso tiraria
      esses três valores. Ler `env` de dentro do core violaria a ADR-001, e
      nenhuma porta os carrega — então entram por injeção como o resto.
- [ ] ⚠️ **MUDANÇA DE CONTRATO — `ClaimClassifier.estimateInputTokens` é
      método OPCIONAL da porta.** Sem ele o pré-flight do budget guard não tem
      de onde tirar a estimativa. Opcional porque um motor local não gasta
      token e um stub não precisa fingir que gasta; quem não implementa cai
      numa aproximação por caracteres, declarada e grosseira. O
      `HybridClassifier` passa a delegar contando apenas o que escalaria.
- [ ] ⚠️ **`AnalysisError` ganhou `retryAfterSeconds`.** O acceptance criteria
      exige `Retry-After` em `RATE_LIMITED` e `BUDGET_EXCEEDED`, mas a borda
      HTTP só recebe a exceção — e as guardas já calculam o valor. Sem isso, a
      alternativa era a rota inventar um número.
- [ ] **`NoopSuggestionWriter`** ocupa o lugar do `ClaudeSuggestionWriter`, que
      não existe. Devolve lista vazia em vez de lançar: ausência de sugestão
      não é falha, e marcar `suggestionsDegraded` diria ao usuário que algo
      quebrou quando nada quebrou.
- [ ] **`extensionAlias` no `next.config.ts`.** O projeto importa com extensão
      `.js` em arquivos `.ts` — convenção que `tsc`, `vitest` e `tsx` já
      entendiam e que o resolvedor do webpack não. Sem isso `next build`
      falha com `Module not found` no primeiro import da rota.

**A armadilha do `NODE_ENV` era real e foi verificada, não presumida.**
`AllowAllRateLimiter` e `UnlimitedBudgetGuard` lançam sob
`NODE_ENV=production`, e `next build` roda exatamente assim. Provado em
execução: importar `container.ts` sob `NODE_ENV=production` não faz nada;
chamar `getAnalyzeUrl()` lança `AllowAllRateLimiter`. É a instanciação
preguiçosa que faz o build passar — e a guarda continua valendo onde importa,
derrubando o primeiro request de um deploy sem os adapters de Redis.

### Correções da revisão da rodada 1 (2026-08-28)

A revisão achou 1 crítico e 8 avisos. Sete foram corrigidos; dois seguem
abertos e estão listados no fim.

- [ ] **Bug crítico de CSS que passou por revisão de código.**
      `.text mark { background: transparent }` tem especificidade (0,1,1) e
      vencia `.cat-*`, de (0,1,0). Todo destaque no texto ficava sem fundo,
      enquanto a LEGENDA — outro seletor, sem colisão — mostrava as cores.
      A tela não parecia quebrada; parecia decisão de design. O reset desceu
      para o seletor de elemento `mark`, de (0,0,1).
      **A lição é sobre verificação, não sobre CSS:** o bug entrou por leitura
      de código e só sairia por execução. Agora há
      `tests/adapters/ui/highlight-cascade.test.ts`, que resolve a cascata com
      `jsdom` — confirmado que ele REPRODUZ o bug na versão antiga, ou seja, é
      um oráculo que sabe falhar.
- [ ] **`INTERNAL_ERROR` saiu de dentro de um objeto anônimo** e virou o tipo
      `UnexpectedErrorBody`, separado de `KnownErrorBody`. NÃO foi acrescentado
      a `AnalysisErrorCode`: aquela união enumera o que o produto sabe tratar,
      e o 500 é exatamente o que ele não sabe. Diluir um no outro faria a
      checagem de exaustividade do mapa de status cobrir um caso que ela não
      pode cobrir.
- [ ] **"Não analisável" e "não coube no limite" deixaram de renderizar
      idênticas.** Numa análise truncada, sentenças analisáveis fora do cap
      herdavam o rótulo "Fora da análise (título, lista, fragmento)" — razão
      falsa sobre elas. Novo estado `unanalyzed`, com estilo e rótulo próprios,
      e legenda que descreve só o que a tela contém.
- [ ] **O invariante score+breakdown da ADR-004 passou a ser do TIPO.**
      `buildScorePanel` devolve uma união em que a variante `scored` carrega os
      dois campos no mesmo valor, e a variante `unscored` não tem campo
      numérico algum. Antes eram dois condicionais independentes no JSX que
      dependiam de disciplina para concordar.
      **Decisão deliberada:** NÃO foi instalado `@testing-library/react`. A
      lógica saiu para `src/components/report-model.ts`, sem React, testada em
      `tests/contract/report-model.test.ts` — o teste trava a REGRA, não a
      marcação, e sobrevive ao redesign do M3.
- [ ] **Falha de `countTokens` deixou de derrubar a análise.** Degrada para a
      aproximação por caracteres. Não abre buraco no teto: a aproximação é
      conservadora e nunca zero, então o `BudgetGuard` segue decidindo sobre um
      número da ordem certa. E não esconde falha — se o provedor caiu, a
      classificação logo abaixo cai também, e o erro passa a vir da operação
      que importa em vez de uma chamada gratuita e auxiliar.
- [ ] **`resetContainer()` removido** — era dead code, exportado sem consumidor.
- [ ] **`makeHarness` deixou de devolver referências fantasma.** Ele criava as
      instâncias antes de `deps` aplicar `...overrides`, então um teste que
      sobrescrevesse uma porta e asseverasse sobre a referência devolvida
      inspecionava um objeto que o pipeline nunca tocou — e passava. Agora as
      referências saem de `deps`, depois do spread.

**Ainda em aberto, conscientemente:**

- [ ] **"Disclaimer acima da dobra" não tem teste.** É requisito posicional e
      não há como verificá-lo sem navegador. A PRESENÇA da ressalva no payload
      tem teste de contrato; a POSIÇÃO na tela não tem, e fica assim até o M3.
      Registrado em vez de coberto por um teste que fingiria verificá-lo.
- [ ] **`x-forwarded-for` é confiado sem verificação** — rodada 3, junto com o
      rate limiter de Redis. `clientKeyOf` em `route.ts` é o ponto único a
      endurecer.

### 🔬 RESULTADO DA CALIBRAÇÃO (2026-08-28) — a premissa da ADR-002 não se sustenta

Primeira execução do pipeline completo sobre corpus real: 11 artigos
baixados, **2.149 sentenças analisáveis**, 3 artigos classificados pelo LLM
antes de o guarda de custo abortar.

**Achado central: o pré-filtro determinístico resolve 0,3% dos casos.**
A ADR-002 estabelece meta de ≥50%. A medição diz que ele é praticamente
inerte em conteúdo real.

Frequência dos sinais em 2.149 sentenças:

| Sinal | Ocorrências | % |
|---|---|---|
| `source_date` | 375 | 17,4% |
| `hedge_vague_quantifier` | 121 | 5,6% |
| `hedge_modal` | 52 | 2,4% |
| `opinion_imperative` | 28 | 1,3% |
| `source_quantity` | 27 | 1,3% |
| `opinion_adjective` | 19 | 0,9% |
| **`source_attribution`** | **9** | **0,4%** |
| **`opinion_first_person`** | **0** | **0%** |

Duas descobertas que invalidam pressupostos da ADR-002:

- [ ] **A atribuição nomeada aparece em 0,4% das sentenças.** A regra de
      `SOURCED` direto exige a CONJUNÇÃO de atribuição com quantidade ou data
      na mesma sentença — combinação matematicamente quase impossível quando
      um dos termos é tão raro. Em prosa real a atribuição está numa frase e
      o número em outra.
- [ ] **`opinion_first_person` NUNCA ocorreu** em 2.149 sentenças. O caso 2
      da ADR-002 (OPINION decidido por regra) é código morto em conteúdo
      profissional, que não escreve "eu acho".

Variantes de regra medidas sobre o mesmo corpus:

| Variante | Resolve | Observação |
|---|---|---|
| ATUAL: quantidade **E** atribuição | **0,3%** | praticamente inerte |
| ALT-1: atribuição sozinha | 0,4% | não ajuda — a atribuição é que é rara |
| ALT-2: atribuição **OU** quantidade/data | 19,6% | melhor, mas longe de 50% |

- [ ] **Nem a variante mais permissiva alcança a meta.** E ALT-2 compraria
      cobertura ao custo de falso positivo: `source_date` carrega quase toda
      a diferença (17,4%), e data sozinha NÃO é fonte — "em 2024 a empresa
      cresceu" tem data e nenhuma fonte. Seria exatamente o erro confiante
      que a ADR-002 define como inaceitável.
- [ ] **Decisão de arquitetura necessária:** aceitar que o motor é LLM puro e
      simplificar, redesenhar os sinais, ou revisar a meta de 50%. Não é
      decisão de implementação.

**Números da execução:**

| Métrica | Valor |
|---|---|
| Taxa de escalonamento | **100%** em todos os artigos (meta: ≤50%) |
| Custo médio por artigo | **US$ 0,0499** (projeção da ADR-005: US$ 0,007) |
| Pior artigo | US$ 0,1050 — 15x a estimativa, disparou o guarda |
| Custo total gasto | US$ 0,1497 de US$ 0,50 autorizados |
| `cache_read` | 0 tokens, como previsto para o haiku |
| Scores obtidos | 17, 23, 24 — amplitude de apenas 7 pontos |

- [ ] **A projeção de custo da ADR-005 estava errada por 7x**, e a causa é
      direta: ela assumia 50% de escalonamento e ~40 sentenças por artigo.
      O real é 100% e até 149 sentenças analisáveis.
- [ ] **Sinal de alerta de produto:** conteúdo SEO de referência (Moz,
      Ahrefs) pontuou 23 e 24 numa escala de 0 a 100. Se páginas pilares do
      próprio nicho tiram nota baixa, ou a escala está mal calibrada ou o
      produto vai dizer a todo mundo que seu conteúdo é ruim. Os pesos
      0,6/0,4 da ADR-003 precisam ser revisitados com esse dado.

**Entregáveis:** `scripts/calibrate.ts`, `scripts/calibration/` (urls, fetch,
índice), CSV com 331 sentenças classificadas para conferência manual em
`scripts/calibration/output/`.

### ⛔ Bloqueador de M4 — não resolver antes do deploy é irresponsável

- [ ] **TOCTOU / DNS rebinding no `HttpContentFetcher`.** `assertPublicHost`
      resolve o hostname e, em seguida, `fetch()` resolve de novo por conta
      própria. DNS com TTL curto pode devolver IP público na checagem e IP
      interno na conexão. Corrigir exige fixar o IP resolvido — conector
      próprio do `undici`, ou conectar por IP com header `Host`. É trabalho
      de arquitetura, não remendo. **Bloqueia o deploy público de M4.**

### Pendência de honestidade corrigida nesta rodada

- [ ] **`loadEnv` continua sem ponto de boot.** A rota e o container são
      escopo do componente D, que depende de `ANTHROPIC_API_KEY`. O que
      mudou: o comportamento agora é verificado por teste, e este documento
      deixou de afirmar que a validação está ligada. Ligar de verdade é
      tarefa do container, em `M2 — Sequencial`.

---

## M1 — Fundação (target 2026-08-29)

Objetivo: congelar contratos. Nenhum adapter antes daqui.

- [x] `package.json` — Next.js, TypeScript, Zod, `@anthropic-ai/sdk`, `@mozilla/readability`, `linkedom`, Vitest
- [x] `tsconfig.json` com `strict: true` e `noUncheckedIndexedAccess: true`
- [x] `next.config.ts`
- [x] `vitest.config.ts`
- [x] `.eslintrc.json` — `no-restricted-imports` proibindo `next`, `@anthropic-ai/sdk`, `@mozilla/readability`, `linkedom` dentro de `src/core/**`
- [x] `.env.example` com todas as variáveis da tabela em [api/spec.md](specs/api/spec.md), sem valores reais
- [x] `src/adapters/config/env.ts` — schema Zod escrito e TESTADO (o ponto de boot que o invoca chega com o container, em M2 Sequencial)
- [x] `src/core/domain/sentence.ts`
- [x] `src/core/domain/classification.ts`
- [x] `src/core/domain/extracted-content.ts`
- [x] `src/core/domain/methodology.ts`
- [x] `src/core/domain/analysis.ts`
- [x] `src/core/domain/errors.ts` — `AnalysisError` + união fechada de códigos
- [x] `src/core/ports/*.ts` — as 9 portas
- [x] `src/adapters/clock/system-clock.ts`
- [x] Verificar: `npm run dev` sobe, `npm run lint` passa, regra de import do core dispara em teste proposital

**Gate de M1:** as portas e os tipos de domínio estão congelados. A partir daqui os 4 adapters podem ser paralelizados.

---

## M2 — Motor de análise (target 2026-09-05)

O marco de maior risco. Se algo escorregar no projeto, o escopo cortado é o de M3 — nunca a validação deste marco.

### Paralelizável (4 agentes, após o gate de M1)

Split registrado em `.spec.yaml` § `subagents`.

**Componente A — extração**
- [x] `src/adapters/fetch/http-content-fetcher.ts` com **todas** as defesas de SSRF de `design.md` § Security
- [x] `src/adapters/extract/readability-extractor.ts`
- [x] Detecção de idioma (`<html lang>` + fallback por stopwords)
- [x] Coleta de `externalDomains`
- [ ] `tests/fixtures/html/` — páginas salvas cobrindo cada modo de falha
- [ ] Testes: artigo OK, paywall, JS-heavy, não-HTML, idioma não suportado
- [x] Testes de SSRF: IP privado, loopback, metadata, **redirect** para IP privado
- [x] Teste: cap de bytes interrompe durante o stream

**Componente B — segmentação**
- [x] `src/adapters/segment/intl-sentence-segmenter.ts`
- [x] Marcação de `analyzable` + `excludedReason`
- [x] Offsets `start` / `end`
- [x] Testes: abreviação (`Dr.`, `etc.`, `p. ex.`), decimal (`3,14`), reticências, heading, item de lista, legenda

**Componente C — pré-filtro de regras**
- [x] `src/adapters/classify/signals/types.ts`
- [x] `src/adapters/classify/signals/pt-br.ts` — tabelas de [ADR-002](../../decisions/002-motor-hibrido.md)
- [x] `src/adapters/classify/signals/en.ts`
- [x] `src/adapters/classify/rule-prefilter.ts`
- [x] Teste: `SOURCED` direto sem LLM
- [x] Teste: `OPINION` direto sem LLM
- [x] Teste: falsa autoridade **escala** (`"Estudos mostram que..."`)
- [x] **Teste-invariante: nenhuma sentença recebe `UNSOURCED` com `decidedBy: 'rules'`**

**Componente D — classificador LLM**
- [x] `src/adapters/classify/schemas.ts` — Zod, **sem** campo de justificativa por sentença
- [x] `src/adapters/classify/prompts/classify-system.ts` — prefixo estável e cacheável
- [x] `src/adapters/classify/claude-classifier.ts` — `messages.parse()` + `zodOutputFormat`, `effort: "low"`, `cache_control` no `system`, `betas: ["server-side-fallback-2026-07-01"]` + `fallbacks: "default"`
- [x] Guarda de `stop_reason === 'refusal'` **antes** de ler `content`
- [x] Guarda de `parsed_output === null`
- [x] Particionamento por `MAX_SENTENCES_PER_LLM_CALL`
- [x] Cadeia de tratamento de erro do SDK, do mais específico ao mais genérico
- [x] Extração de `usage` para `ClassifierUsage`

### Sequencial (depois de A–D)

- [x] `src/adapters/classify/hybrid-classifier.ts` — composição
- [x] `src/core/scoring/weights.ts`
- [x] `src/core/scoring/compute-score.ts` — função pura
- [x] `tests/core/scoring/compute-score.test.ts` — tabela cobrindo os 3 casos de borda
- [x] `src/adapters/ratelimit/allow-all-rate-limiter.ts` (dev)
- [x] `src/adapters/budget/unlimited-budget-guard.ts` (dev)
- [x] `src/core/usecases/analyze-url.ts`
- [x] `tests/helpers/stub-ports.ts`
- [x] `tests/core/analyze-url.test.ts` — todas as portas stubadas (caminho difere da spec: sem subpasta `usecases/`)
- [x] **Teste de ordem: `budgetGuard.authorize` é chamado antes de `classifier.classify`** — verifica a sequência inteira, não só esse par
- [x] `src/adapters/config/container.ts` — instanciação PREGUIÇOSA, ver débito abaixo
- [x] `src/app/api/analyze/route.ts` — runtime `nodejs`; o mapa vive em `error-status.ts` (arquivo de rota do Next restringe exports)
- [x] `tests/contract/analyze-payload.test.ts` — falha se faltar `methodology`, `scoreVersion` ou `breakdown`

### Calibração — acceptance criteria do marco

- [ ] `tests/fixtures/corpus/` — ≥10 artigos reais e diversos (dados, opinião, misto, PT-BR e EN)
- [ ] `scripts/calibrate.ts` — score, breakdown, taxa de escalonamento, distribuição por `decidedBy`, `usage` e custo em dólares
- [ ] Export CSV sentença-a-sentença para conferência manual
- [ ] **Rodar sobre o corpus e conferir manualmente a classificação**
- [ ] Verificar `cache_read_input_tokens > 0` em execuções repetidas (zero ⇒ invalidador silencioso no prefixo)
- [ ] Confirmar taxa de escalonamento ≤50%
- [ ] Registrar custo médio real por análise
- [ ] **Reavaliar OQ-1 (tier do modelo) com custo real e qualidade real medidos lado a lado**
- [ ] **Revisitar os pesos 0.6 / 0.4 de [ADR-003](../../decisions/003-formula-do-score.md) à luz da calibração**

**Gate de M2:** o usuário conferiu a classificação e a considerou aceitável. Sem esse aval, M3 não começa.

---

## M3 — Relatório / UI (target 2026-09-12)

- [ ] Designer produz a especificação visual a partir de [ui-relatorio/spec.md](specs/ui-relatorio/spec.md)
- [ ] Instalar e configurar o framework de UI escolhido
- [ ] `src/app/layout.tsx`, `globals.css`
- [ ] `src/lib/api-client.ts` — cliente tipado
- [ ] `src/components/url-form.tsx`
- [ ] Indicador de progresso por estágio
- [ ] `src/components/score-panel.tsx` — score **sempre** com breakdown no mesmo campo visual
- [ ] `src/components/breakdown-chart.tsx`
- [ ] `src/components/inline-highlight.tsx` — texto como texto, **sem** `dangerouslySetInnerHTML`
- [ ] `src/components/methodology-notice.tsx`
- [ ] `src/app/metodologia/page.tsx`
- [ ] `src/adapters/classify/prompts/suggest-system.ts`
- [ ] `src/adapters/classify/claude-suggestion-writer.ts`
- [ ] `src/components/suggestion-list.tsx`
- [ ] Degradação: `suggestionsDegraded` comunicado na UI
- [ ] Estado visual próprio para `unscored` (distinto de score baixo e de erro)
- [ ] Estado de erro para cada `AnalysisErrorCode`
- [ ] Sentença não analisável visualmente distinta
- [ ] Verificar: navegação por teclado, `prefers-reduced-motion`, dark mode
- [ ] Verificar por busca: nenhum `dangerouslySetInnerHTML`

---

## M4 — Hardening + deploy (target 2026-09-17)

Os três primeiros itens são **bloqueadores de deploy público**.

- [ ] Resolver **OQ-2** com o usuário (dependência de Redis)
- [ ] `src/adapters/ratelimit/redis-rate-limiter.ts` — janela deslizante por IP
- [ ] `src/adapters/budget/redis-budget-guard.ts` — pré-flight `countTokens`, teto diário, dois motivos de recusa
- [ ] `src/adapters/budget/redis-cost-recorder.ts`
- [ ] `tests/adapters/budget/redis-budget-guard.test.ts` com `FixedClock`
- [ ] Trocar os adapters de dev pelos de produção no `container.ts`
- [ ] `Retry-After` em 429 e 503
- [ ] Truncagem por `MAX_ANALYZABLE_SENTENCES` sinalizada no relatório
- [ ] `maxDuration` da rota configurado com folga sobre 15s
- [ ] Revisar todas as mensagens de erro ao usuário — especialmente `NO_MAIN_CONTENT`, que é a mais frequente na vida real
- [ ] Log estruturado sem vazar segredo; registrar que a URL analisada aparece em log
- [ ] Configurar variáveis de ambiente no provider de deploy
- [ ] **Verificar que nenhuma das três defesas está desabilitada em produção**
- [ ] Deploy público
- [ ] Smoke test em produção com ≥3 URLs reais
- [ ] Verificar rate limit e budget guard funcionando **em produção**, não só em teste

---

## Testing

Critério de teste conforme `conventions.md` § TDD Skip Criteria. Tudo aqui tem ramificação, efeito colateral ou dependência externa — nada se qualifica para skip.

- [ ] `compute-score` — tabela de casos, incluindo bordas
- [ ] `rule-prefilter` — por sinal e o invariante de `UNSOURCED`
- [ ] `intl-sentence-segmenter` — casos de quebra difícil em PT-BR
- [ ] `readability-extractor` — um fixture por modo de falha
- [ ] `http-content-fetcher` — suite de SSRF, incluindo redirect
- [x] `analyze-url` — portas stubadas, incluindo teste de ordem das guardas
- [ ] `redis-budget-guard` — janelas com `FixedClock`
- [x] Contrato da resposta — campos obrigatórios de ADR-004
- [ ] Regra de lint do core dispara em import proibido

---

## Verification

- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [x] `npm run test` — 666 testes, 37 arquivos
- [x] `npm run build`
- [ ] `npx tsx scripts/calibrate.ts` — relatório de calibração gerado
- [ ] Manual: analisar 3 artigos reais em PT-BR do início ao fim pela UI
- [ ] Manual: provocar cada modo de falha de extração e ler a mensagem como um usuário leria

---

## Documentation

- [x] `README.md` — o que é, como rodar, variáveis de ambiente, e a cota medida
- [ ] Consolidar em `specs/living/` ao concluir o change
- [ ] Long-Term Manager atualiza `docs/session-log.md` e `docs/context-resume.md` ao fim de cada sessão
- [x] Registrar a política de log de URL antes do deploy público — decidida,
      implementada em `src/app/api/analyze/log-seguro.ts` e travada por teste

---

## Completion

- [ ] Todos os acceptance criteria dos 6 spec deltas verificados
- [ ] Mover `specs/changes/001-analisador-densidade-factual/` para `specs/archive/2026-XX-XX-001-analisador-densidade-factual/`
- [ ] `.spec.yaml` → `status: completed`
- [ ] `docs/long-term-plan.md` atualizado com o estado real dos marcos


## Direção visual 2 — "Precisão Escura" (implementada 2026-08-31)

Implementa `specs/ui-relatorio/design-visual-2.md`, que supersede
`design-visual.md`.

- [x] `globals.css`: paleta única escura + a folha clara, sem bloco de tema claro
- [x] `layout.tsx`: Archivo, Source Serif 4 e JetBrains Mono via `next/font`
- [x] `page.tsx`: as 8 seções (topbar, hero, como funciona, três lápis, o que
      não medimos, limites, rodapé)
- [x] `analyzer.tsx`: barra de método, breakdown, folha, ficha técnica,
      `scrollIntoView` no resultado
- [x] `report-model.ts`: `Segment.classified` ganha `confidence` e `signals`
- [x] `icons.tsx`: os 7 ícones SVG inline
- [x] `opengraph-image.tsx`: o card do LinkedIn
- [x] Contraste calculado e travado em teste (28 pares de corpo + 10 de
      componente)
- [x] 9 sabotagens aplicadas e detectadas pelos testes

### Desvios da spec, decididos na implementação

- **`--line-field` é token novo, não previsto na spec.** Ver a nota de
  implementação na § 3.4 do `design-visual-2.md`.
- **A OG image desenha os três traços como SEGMENTOS, não com
  `border-style`.** O Satori (renderizador do `next/og`) aceita só `solid` e
  `dashed`; `dotted` reprova o build. Como o pontilhado é o canal
  não-cromático da terceira categoria, perdê-lo não era opção.
- **`.unanalyzed` distingue-se de `.excluded` por FUNDO, não por traço.** A
  spec não especificou o canal. Traço não servia: solid/dashed/dotted já
  pertencem às três categorias.
- **`metadataBase` acrescentado** ao `layout.tsx`, não previsto na spec. Sem
  ele o Next resolve a OG image contra `localhost:3000` e o card quebraria em
  produção — que é o único ambiente onde ele importa.

### Débito registrado, NÃO feito nesta rodada

- [x] **O nome do autor no rodapé.** Preenchido pelo usuário no site e no
      README. O código nunca o inventou, que era o ponto.
- [x] ✅ **A rota `/metodologia` EXISTE e cumpre os três itens da ADR-004 item 4**
      — quais sinais, como o score é calculado, o que não foi medido. Fechada em
      2026-09-01.
      - A página é gerada a partir do código: pesos, limiares, lista de sinais e
        a ressalva vêm de `import`, não de texto digitado. Uma página de
        metodologia que repete valores à mão é a próxima a ficar desatualizada,
        e aqui o erro seria caro — ela é a fonte de verdade sobre o método.
      - `ALL_SIGNAL_KINDS` nasceu para isso: `SignalKind` é um tipo, e tipo não
        existe em execução, então não havia como um teste perguntar "a página
        lista todos os sinais?". O `Record<SignalKind, true>` faz acrescentar um
        tipo à união QUEBRAR A COMPILAÇÃO até ele ser listado.
      - `METHODOLOGY_URL` volta a apontar para `/metodologia`. O default já
        apontou para lá quando a rota não existia (404) e depois para `/#metodo`,
        uma seção que cobria só o terceiro item.
- [x] O link da seção "O que não medimos" aponta para `specs/decisions/` no
      repositório. O anterior mirava `#metodologia` num README que não existe.
- [ ] **Drawer mobile não implementado.** A spec § 12 o especifica; a topbar
      hoje mostra os três links direto, o que cabe em 390px mas fica apertado.
      Não é bloqueador.
- [ ] **Nenhum teste cobre a posição do disclaimer na tela.** Ele é o primeiro
      filho do painel por construção, e o `scrollIntoView` traz o painel ao
      topo — mas isso é verificável só em navegador. A ADR-004 protege o
      CONTEÚDO por teste de contrato; a POSIÇÃO segue sem oráculo.
- [ ] **`scrollIntoView` e `matchMedia` não são exercitados por teste.** O
      ambiente do Vitest é `node`, sem DOM. Verificação é visual.


## 🔴 ACHADO MEDIDO 2026-08-31 — landing pages passam e são medidas nas sobras

Ferramenta: `scripts/medir-landing-pages.ts` (extração + segmentação + guarda,
sem LLM, custo zero).

```
página      tipo     palavras  sent  analis   razão  veredito
linear      lp            824   163      30   0.184  BARRADA pela guarda
vercel      lp             81    21       3   0.143  BARRADA pela guarda
stripe      lp            798    94      38   0.404  passaria para o LLM
resend      lp            568    80      37   0.463  passaria para o LLM
plausible   lp            330    33      22   0.667  passaria para o LLM
rdstation   lp            431    63      25   0.397  passaria para o LLM
moz-artigo  artigo       1910   175     100   0.571  passaria para o LLM
```

Motivos de exclusão:

```
linear       heading:131 short:2
vercel       heading:18
stripe       heading:49 short:7
resend       heading:41 short:2
plausible    heading:6 short:5
rdstation    heading:37 short:1
moz-artigo   heading:68 list_item:4 short:3
```

### O que os números dizem

1. **A guarda de índice NÃO separa LP de artigo, e nunca foi feita para isso.**
   Ela foi calibrada sobre 7 fixtures em que não havia uma única LP. A Plausible
   tem razão 0,667, MAIOR que o artigo da Moz (0,571).

2. **4 de 6 LPs passariam para o LLM** e receberiam score.

3. **`heading` domina a exclusão em toda LP.** E numa LP a headline É a
   afirmação: "2x mais rápido", "reduza custos em 40%". A regra atual
   ("sem pontuação terminal e curto = título") descarta exatamente a parte
   densa em afirmação.

4. **Consequência:** a LP não é recusada, é medida nas SOBRAS — parágrafos de
   rodapé e texto corrido. O número sai plausível e é sem sentido. É o mesmo
   modo de falha que motivou a guarda de índice ("lixo plausível, não erro, que
   é pior porque passa"), e a guarda não pega porque a razão fica acima de 0,35.

5. **A Vercel extraiu 81 palavras de toda a home**, contra piso de 60. Passou
   por um fio na extração e foi barrada depois pela razão — resultado certo por
   caminho errado.

### O que isto NÃO é

Não é bug de implementação, e não se corrige com limiar. Exige decidir **o que
conta como afirmação**: hoje é sentença com verbo e pontuação terminal; para LP
teria que incluir fragmento assertivo. E exige repensar a linha de base, porque
LP é persuasão por natureza e quase toda daria "95% sem fonte" — a mesma
compressão de régua que já trava o composto (emenda da ADR-007).

### Ações

- [ ] **Architect:** decidir se LP entra no escopo. Se entrar, é change nova
      (004), com decisão sobre a unidade de análise e sobre a linha de base.
- [ ] **Curto prazo, sem depender da decisão acima:** a tela declara "artigos
      públicos" na seção Limites, o que é vago. Se uma LP passa e é medida
      parcialmente, o usuário não é avisado. Considerar aviso quando a razão de
      analisáveis for baixa mas acima do limiar da guarda — a informação já
      existe em `IndexPageAssessment.analyzableRatio` e não é exibida.

## Política de log de URL — decidida em 2026-09-01

O item pedia "registrar a política antes do deploy público". Registrada, e com
o levantamento que a motivou.

**O que foi verificado, ponto a ponto:**

| ponto de log | escreve a URL do visitante? |
|---|---|
| `ConsoleCostRecorder` (dev) | não — modelo e tokens |
| `RedisCostRecorder` (prod) | não — modelo, tokens e custo |
| `RedisBudgetGuard` | não — a chave é `citescore:...:<data>` |
| **`catch` final de `route.ts`** | **podia** — registrava o objeto de erro inteiro |

Um vetor só, e justamente o caminho de erro inesperado: erro de rede costuma
trazer o endereço na mensagem, e a pilha é o esconderijo fácil, porque ninguém
pensa nela ao revisar um log.

**A política:**

1. **A URL enviada pelo visitante não vai para o log.** Vale para mensagem e
   para pilha. Implementado em `log-seguro.ts`, com teste — combinado de equipe
   não sobrevive a uma dependência atualizada que passe a incluir o endereço
   onde antes não incluía.
2. **Nome, mensagem e pilha continuam sendo registrados**, filtrados. Registrar
   nada trocaria um defeito por outro: falha em produção sem log é falha que
   ninguém conserta.
3. **O que É guardado, e onde:** a análise fica no Redis com a URL na chave, por
   24 horas — 30 dias nos artigos em destaque. Nada sobre QUEM pediu é
   armazenado. Isso é diferente de espalhar a URL em log de plataforma, cuja
   retenção e alcance não controlamos, e está dito no README.

**O que esta política NÃO é:** anonimato. O risco aqui é modesto — o produto só
aceita página pública e recusa o que está atrás de login. Mas dado de usuário em
log de terceiro é uma escolha, e escolha merece ser feita de propósito em vez de
por omissão.
