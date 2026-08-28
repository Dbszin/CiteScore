# Tasks: Analisador de Densidade Factual (v1)

Checklist ordenado. A ordem é a de `design.md` § Estratégia de Implementação e não é arbitrária: portas antes de adapters (viabiliza paralelização), motor antes de UI (o risco primeiro), guardas antes de deploy.

## Setup

- [x] Criar estrutura de `specs/`
- [x] Inicializar `.spec.yaml`
- [x] Escrever ADRs 001–005
- [x] Escrever `proposal.md`, `design.md` e os 6 spec deltas
- [ ] Long-Term Manager atualizar `docs/progress-checklist.md` marcando "Especificações escritas pelo Architect" como `done`

---

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
- [ ] `src/adapters/classify/schemas.ts` — Zod, **sem** campo de justificativa por sentença
- [ ] `src/adapters/classify/prompts/classify-system.ts` — prefixo estável e cacheável
- [ ] `src/adapters/classify/claude-classifier.ts` — `messages.parse()` + `zodOutputFormat`, `effort: "low"`, `cache_control` no `system`, `betas: ["server-side-fallback-2026-07-01"]` + `fallbacks: "default"`
- [ ] Guarda de `stop_reason === 'refusal'` **antes** de ler `content`
- [ ] Guarda de `parsed_output === null`
- [ ] Particionamento por `MAX_SENTENCES_PER_LLM_CALL`
- [ ] Cadeia de tratamento de erro do SDK, do mais específico ao mais genérico
- [ ] Extração de `usage` para `ClassifierUsage`

### Sequencial (depois de A–D)

- [ ] `src/adapters/classify/hybrid-classifier.ts` — composição
- [x] `src/core/scoring/weights.ts`
- [x] `src/core/scoring/compute-score.ts` — função pura
- [x] `tests/core/scoring/compute-score.test.ts` — tabela cobrindo os 3 casos de borda
- [x] `src/adapters/ratelimit/allow-all-rate-limiter.ts` (dev)
- [x] `src/adapters/budget/unlimited-budget-guard.ts` (dev)
- [ ] `src/core/usecases/analyze-url.ts`
- [ ] `tests/helpers/stub-ports.ts`
- [ ] `tests/core/usecases/analyze-url.test.ts` — todas as portas stubadas
- [ ] **Teste de ordem: `budgetGuard.authorize` é chamado antes de `classifier.classify`**
- [ ] `src/adapters/config/container.ts`
- [ ] `src/app/api/analyze/route.ts` — runtime `nodejs`, mapa de status com exaustividade
- [ ] `tests/contract/analyze-response.test.ts` — falha se faltar `methodology`, `scoreVersion` ou `breakdown`

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
- [ ] `analyze-url` — portas stubadas, incluindo teste de ordem das guardas
- [ ] `redis-budget-guard` — janelas com `FixedClock`
- [ ] Contrato da resposta — campos obrigatórios de ADR-004
- [ ] Regra de lint do core dispara em import proibido

---

## Verification

- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm run test`
- [ ] `npm run build`
- [ ] `npx tsx scripts/calibrate.ts` — relatório de calibração gerado
- [ ] Manual: analisar 3 artigos reais em PT-BR do início ao fim pela UI
- [ ] Manual: provocar cada modo de falha de extração e ler a mensagem como um usuário leria

---

## Documentation

- [ ] `README.md` — o que é, como rodar, variáveis de ambiente
- [ ] Consolidar em `specs/living/` ao concluir o change
- [ ] Long-Term Manager atualiza `docs/session-log.md` e `docs/context-resume.md` ao fim de cada sessão
- [ ] Registrar a política de log de URL antes do deploy público

---

## Completion

- [ ] Todos os acceptance criteria dos 6 spec deltas verificados
- [ ] Mover `specs/changes/001-analisador-densidade-factual/` para `specs/archive/2026-XX-XX-001-analisador-densidade-factual/`
- [ ] `.spec.yaml` → `status: completed`
- [ ] `docs/long-term-plan.md` atualizado com o estado real dos marcos
