# Tasks: Hardening para deploy público

Checklist ordenado. A ordem é a de `design.md` § Estratégia de Implementação e
não é arbitrária: contratos compartilhados antes dos componentes (senão eles
colidem), componentes antes da integração, integração antes da verificação
com credenciais reais.

**Gasto de LLM previsto: ZERO.** Nada aqui exige chamar a Claude API. As guardas
são testáveis com cliente falso, e o fetcher com resolvedor injetado.

---

## FASE 1 — Contratos compartilhados (sequencial, primeiro)

Os dois componentes da fase 2 dependem destes arquivos. Fazer em paralelo aqui
garante conflito.

- [x] `src/core/domain/errors.ts`: acrescentar `REQUEST_TOO_EXPENSIVE` e
      `GUARD_UNAVAILABLE` à união fechada
- [x] `USER_MESSAGES` para os dois, refletindo a diferença de acionabilidade:
      "artigo grande demais, tente um menor" **é** acionável; "cota do dia
      acabou" **não é**
- [x] `src/app/api/analyze/error-status.ts`: `REQUEST_TOO_EXPENSIVE` → **413**,
      `GUARD_UNAVAILABLE` → **503**, e `BUDGET_EXCEEDED` de **429 para 503**
- [x] Atualizar `tests/contract/analyze-payload.test.ts` — o teste que compara as
      chaves de `HTTP_STATUS` e `USER_MESSAGES` vai acusar as ausências
- [x] `src/adapters/config/env.ts`: remover `DAILY_TOKEN_BUDGET` e
      `MAX_TOKENS_PER_REQUEST`; acrescentar `DAILY_BUDGET_USD` (1.00),
      `MAX_REQUEST_BUDGET_USD` (0.10), `MODEL_INPUT_USD_PER_MTOK` (1.00),
      `MODEL_OUTPUT_USD_PER_MTOK` (5.00), `BUDGET_OUTPUT_RATIO` (0.70)
- [x] `.env.example`: refletir as variáveis novas. **Valores vazios** — este
      arquivo é versionado, e já houve incidente de chave real colada nele
- [x] Verificar: `npx tsc --noEmit` acusa todo lugar que precisa tratar os
      códigos novos. A união fechada é a checklist

---

## FASE 2A — Fetch sem TOCTOU (paralelizável com 2B)

Ver [ADR-008](../../decisions/008-validacao-no-caminho-de-conexao.md) e
[fetch-seguro/spec.md](specs/fetch-seguro/spec.md).

- [x] Criar `src/adapters/fetch/validating-lookup.ts` com
      `createValidatingLookup`, resolvedor e `onResolved` injetáveis
- [x] Falha fechada: qualquer endereço bloqueado rejeita o hostname **inteiro**
- [x] Tratar as duas formas de callback do `lookup` (`all: true` e `all: false`)
      e `family` 0/4/6 — `net.connect` usa ambas conforme a configuração
- [x] **Rota A:** `Agent` do undici com `connect.lookup`, ligado ao `fetch`
- [x] ⚠️ **PROVAR EM EXECUÇÃO que a função é chamada.** Se o dispatcher for
      ignorado, tudo continua funcionando e nada denuncia. Sem esta prova a
      tarefa não está feita
- [n/a] Rota B não foi necessária — a Rota A se provou. Mantida registrada na
      ADR-008 caso o comportamento do runtime mude:
      ~~Se a Rota A não se provar: **Rota B** (`node:https.request` com `lookup`),
      registrando o motivo. Atenção ao que se perde — descompressão `gzip`/`br`
      passa a ser manual, e o cap de bytes precisa decidir se vale sobre o
      conteúdo comprimido, descomprimido, ou ambos (zip bomb)~~
- [~] ⚠️ **NÃO removido — desvio deliberado.** O `AddressResolver` injetável foi
      ligado à nova função, mas `assertPublicHost` FICOU. Removê-lo esvaziaria
      os 21 testes de SSRF existentes, que injetam transporte falso e nunca
      acionam o lookup. Ver o registro no fim deste arquivo
- [x] **NÃO tocar em `private-address.ts`** — lógica pura correta, 53 casos
      cobrindo. Misturar as duas mudanças esconderia a causa de uma regressão
- [x] `tests/adapters/fetch/toctou.test.ts` — **teste de rebinding**: resolvedor
      devolve público na 1ª chamada e `169.254.169.254` na 2ª; exigir recusa
- [x] Teste: conjunto misto público/privado rejeita o nome inteiro
- [x] Teste: cada salto de redirect passa pela validação
- [x] Teste: HTTPS a host público real mantém verificação de certificado
- [x] Confirmar que `http-content-fetcher.test.ts` e `private-address.test.ts`
      seguem verdes sem alteração
- [x] Conferir se `undici` precisa entrar em `serverExternalPackages` do
      `next.config.ts` (só se a Rota A adotar dependência explícita)

---

## FASE 2B — Guardas Redis (paralelizável com 2A)

Ver [protecao-custo-producao/spec.md](specs/protecao-custo-producao/spec.md).

- [ ] `src/adapters/redis/redis-client.ts` — interface `RedisClient` e
      `RedisUnavailableError`
- [ ] `src/adapters/redis/fake-redis-client.ts` — em memória, relógio injetável,
      capaz de simular indisponibilidade. **Fazer ANTES dos adapters**: é o que
      torna o resto testável sem credenciais
- [ ] `src/adapters/redis/upstash-client.ts` — sobre a **API REST**, não
      protocolo Redis. Traduzir rede, timeout e status não-2xx em
      `RedisUnavailableError`
- [ ] Instalar `@upstash/redis`
- [ ] `src/adapters/ratelimit/redis-rate-limiter.ts` — janela fixa horária,
      `incrByWithTtl`, `retryAfterSeconds` vindo do TTL real
- [ ] `src/adapters/budget/redis-budget-guard.ts` — custo em micro-dólares
      (inteiro, sem float), sobre entrada **e** saída estimada
- [ ] Pré-cobrança em `authorize`, **antes** de liberar
- [ ] Recusa **devolve** o valor pré-cobrado
- [ ] Duas recusas distintas: `request_too_expensive` e `daily_cap_reached`
- [ ] `src/adapters/redis/redis-cost-recorder.ts` — aplica o **delta** entre real
      e estimado; **NUNCA lança**, falha vira log
- [ ] Testes com `FakeRedisClient` + `FixedClock`: limite atingido, virada de
      janela, isolamento entre clientes, concorrência não fura o teto, devolução
      em recusa, reconciliação com custo menor, indisponibilidade vira
      `GUARD_UNAVAILABLE` no limiter e no guard mas **log** no recorder

---

## FASE 3 — Integração (sequencial, depois de 2A e 2B)

- [ ] `container.ts`: selecionar por **presença de credenciais**, não por
      `NODE_ENV`
- [ ] ⚠️ **Manter a instanciação preguiçosa.** Tudo dentro de `buildDeps()`,
      nada em tempo de módulo. Foi verificado em execução e é o que faz
      `next build` passar
- [ ] `route.ts`: emitir `Retry-After` nos três casos
- [ ] Endurecer `clientKeyOf` contra `x-forwarded-for` forjado — a Vercel
      reescreve o cabeçalho na borda, mas quem falar direto com o servidor pode
      forjá-lo. **Item desta change, não débito silencioso**
- [ ] Teste de container: credenciais presentes montam Redis; ausentes montam
      dev; importar sob `NODE_ENV=production` não constrói nada

---

## FASE 4 — Verificação

- [ ] `npx tsc --noEmit`, `npx eslint .`, `npx vitest run`, `npx next build`
- [ ] **Suíte inteira passa SEM credenciais** — é o requisito que permitiu fazer
      tudo isto com o usuário ausente
- [ ] Teste de ordem das guardas continua verde
- [ ] Subir o dev e exercitar os caminhos de erro, que custam zero

### Bloqueado por credenciais do usuário (CRED-1)

- [ ] Verificar `UpstashRedisClient` contra Upstash real
- [ ] Confirmar que o rate limit conta entre invocações distintas
- [ ] Confirmar que o teto diário acumula corretamente
- [ ] Deploy na Vercel
- [ ] Smoke test em produção: ≥3 URLs reais e **as guardas exercitadas em
      produção**, não só em local

---

## Fora do escopo desta change

- Escala do score (ADR-007) — bloqueia divulgação confiante, não deploy
- Change 002 (pré-filtro vira anotador)
- `ClaudeSuggestionWriter`
- Teste do disclaimer acima da dobra — posicional, inverificável sem navegador

## Pendência que só o usuário resolve

- [ ] **Rotacionar a `ANTHROPIC_API_KEY`.** Aberta desde o incidente. Nenhum
      commit publicado a contém — verificado — mas a rotação fecha o caso
- [ ] Criar conta Upstash e fornecer `REDIS_URL` e `REDIS_TOKEN`

---

## Registro da rodada de 2026-08-28 — Fases 1 e 2A concluídas

**OQ-4 RESPONDIDA: a Rota A funciona.** Verificada em execução, não por leitura.

Detalhe que a spec não previa e a sondagem revelou: o Node 20 embute o undici
mas **não o expõe como módulo importável**, então um `Agent` de pacote instalado
à parte seria ignorado em silêncio pelo `fetch` global. A implementação usa o
`fetch` DO UNDICI, pelo ponto de injeção que já existia — não o global com
`dispatcher`.

Também medido: o undici consulta o lookup com `{ hints: 0, all: true }`. A forma
de **array** é obrigatória; devolver escalar faz a requisição falhar.

**A prova de que o teste sabe falhar.** Antes de aceitar o verde, a pinagem foi
sabotada de propósito (dispatcher ignorado, `fetch` global no lugar). O teste de
rebinding acusou `FETCH_FAILED` em vez de `BLOCKED_HOST` — exatamente o previsto.
Um teste que só passa depois da correção não distingue pinagem real de pinagem
ignorada.

### ⚠️ DESVIO DA SPEC, deliberado e registrado

A `fetch-seguro/spec.md` manda **remover** `assertPublicHost`. Ele foi
**mantido**, e a razão é de teste, não de segurança.

Os 21 casos existentes de `http-content-fetcher.test.ts` injetam um `fetch`
falso, que nunca passa pelo transporte real e portanto nunca aciona o lookup.
Removê-lo faria a bateria inteira de SSRF continuar verde **sem exercitar
bloqueio nenhum** — o modo de falha "suíte reporta verde sem ter validado nada"
que este projeto já sofreu uma vez, com 16 testes silenciosamente pulados.

A segurança não depende mais dele: quem fecha a janela de TOCTOU é o lookup, e o
teste de rebinding prova isso passando pela pré-checagem antes de ser barrado no
socket. A pré-checagem fica como rejeição barata e antecipada.

**Pendência para o Architect:** decidir se a spec incorpora a redundância ou se
os 21 testes devem ser reescritos para exercitar o transporte real.

### Verificação em rede real (custo zero, sem Claude API)

| Alvo | Resultado |
|---|---|
| `https://example.com/` | 200, 559 bytes, certificado validado |
| `https://moz.com/learn/seo/what-is-seo` | 200, 132.674 bytes, gzip e charset intactos |
| `http://169.254.169.254/latest/meta-data/` | `BLOCKED_HOST` |
| `http://127.0.0.1:3000/` | `BLOCKED_HOST` |

`undici` **não** precisou entrar em `serverExternalPackages` — `next build` passa.

413 testes (eram 401). tsc, eslint e build verdes.

### Correções da revisão (mesma rodada)

O Reviewer verificou a pinagem de forma independente — reproduziu o oráculo sem
tocar no código-fonte, injetando o `fetch` global como transporte — e confirmou
`BLOCKED_HOST` com pinagem contra `FETCH_FAILED` sem ela. Também **materializou**
dois defeitos de robustez, ambos corrigidos:

- [x] **Exceção dentro do lookup travava a conexão e derrubava o processo.**
      O IIFE assíncrono não tinha `try/catch`: quando `onResolved` lançava, o
      callback NUNCA era chamado — socket pendurado até o deadline — e a
      rejeição escapava, o que no Node 20 derruba o processo. Agora o corpo da
      resolução vive em função própria, envolvida por `try/catch`, e um
      invólucro `responder` garante exatamente UMA invocação do callback.
- [x] **Ciclo em `AggregateError` estourava a pilha.** O guarda de profundidade
      era por invocação e reiniciava ao descer em `errors`. Substituído por
      busca em LARGURA com conjunto de visitados — ciclo vira impossível por
      construção, em vez de improvável.

Quatro testes acrescentados. **Três falharam antes da correção**, com os sintomas
exatos previstos (callback ausente, timeout de 20s, `Maximum call stack size
exceeded`). O quarto — ciclo por `cause` — já passava, porque a cadeia de `cause`
tinha guarda e só a recursão em `errors` era ilimitada; fica como proteção
contra regressão, não como oráculo.

Reconfirmado depois do refactor: rebinding recusado, HTTPS real íntegro,
metadata da AWS barrado.

**417 testes.** tsc, eslint e build verdes.

### ⚠️ Pendências visíveis, deixadas de propósito

- [ ] **`REQUEST_TOO_EXPENSIVE` e `GUARD_UNAVAILABLE` NÃO TÊM PRODUTOR.**
      Varredura confirma: `analysisError('REQUEST_TOO_EXPENSIVE')` e
      `analysisError('GUARD_UNAVAILABLE')` não existem em lugar nenhum do
      código. Estão na união, mapeados a status e com mensagem — e inalcançáveis.
      **A Fase 2B precisa alcançá-los.** Se não alcançar, viram código morto com
      aparência de funcionalidade, que é achado real que este projeto já teve
      (o ramo `strongSource`, que nunca teve produtor).
- [ ] **As cinco variáveis de ambiente novas não têm consumidor.**
      `DAILY_BUDGET_USD`, `MAX_REQUEST_BUDGET_USD`, `BUDGET_OUTPUT_RATIO` e os
      dois preços são validados no boot e lidos por ninguém. Mesma situação, e
      a mesma verificação pendente na próxima revisão.
- [ ] **DNS é resolvido DUAS vezes por salto.** Consequência aceita de manter
      `assertPublicHost`. Com `maxRedirects=3`, até 8 resoluções por análise. O
      cache do SO absorve a maior parte, mas é trabalho duplicado e dobra a
      exposição a instabilidade de DNS.
- [ ] **`options.family` é declarado e ignorado.** Hoje inofensivo: o undici
      chama com `{ hints: 0, all: true }`, sem família. Latente se isso mudar.
- [ ] **Os casts de `createPinnedFetch` silenciam o compilador.** `as never` no
      lookup e `as unknown as typeof fetch` no retorno. A garantia ali vem do
      teste em execução, não do tipo — vale saber ao mexer nesse ponto.
