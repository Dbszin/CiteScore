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

- [x] `src/adapters/redis/redis-client.ts` — interface `RedisClient` e
      `RedisUnavailableError`
- [x] `src/adapters/redis/fake-redis-client.ts` — em memória, relógio injetável,
      capaz de simular indisponibilidade. **Fazer ANTES dos adapters**: é o que
      torna o resto testável sem credenciais
- [x] `src/adapters/redis/upstash-client.ts` — sobre a **API REST**, não
      protocolo Redis. Traduzir rede, timeout e status não-2xx em
      `RedisUnavailableError`
- [x] Instalar `@upstash/redis`
- [x] `src/adapters/ratelimit/redis-rate-limiter.ts` — janela fixa horária,
      `incrByWithTtl`, `retryAfterSeconds` vindo do TTL real
- [x] `src/adapters/budget/redis-budget-guard.ts` — custo em micro-dólares
      (inteiro, sem float), sobre entrada **e** saída estimada
- [x] Pré-cobrança em `authorize`, **antes** de liberar
- [x] Recusa **devolve** o valor pré-cobrado
- [x] Duas recusas distintas: `request_too_expensive` e `daily_cap_reached`
- [x] `src/adapters/redis/redis-cost-recorder.ts` — aplica o **delta** entre real
      e estimado; **NUNCA lança**, falha vira log
- [x] Testes com `FakeRedisClient` + `FixedClock`: limite atingido, virada de
      janela, isolamento entre clientes, concorrência não fura o teto, devolução
      em recusa, reconciliação com custo menor, indisponibilidade vira
      `GUARD_UNAVAILABLE` no limiter e no guard mas **log** no recorder

---

## FASE 3 — Integração (sequencial, depois de 2A e 2B)

- [x] `container.ts`: selecionar por **presença de credenciais**, não por
      `NODE_ENV`
- [x] ⚠️ **Manter a instanciação preguiçosa.** Tudo dentro de `buildDeps()`,
      nada em tempo de módulo. Foi verificado em execução e é o que faz
      `next build` passar
- [x] `route.ts`: emitir `Retry-After` nos três casos
- [x] Endurecer `clientKeyOf` contra `x-forwarded-for` forjado — a Vercel
      reescreve o cabeçalho na borda, mas quem falar direto com o servidor pode
      forjá-lo. **Item desta change, não débito silencioso**
- [x] Teste de container: credenciais presentes montam Redis; ausentes montam
      dev; importar sob `NODE_ENV=production` não constrói nada

---

## FASE 4 — Verificação

- [x] `npx tsc --noEmit`, `npx eslint .`, `npx vitest run`, `npx next build`
- [x] **Suíte inteira passa SEM credenciais** — é o requisito que permitiu fazer
      tudo isto com o usuário ausente
- [x] Teste de ordem das guardas continua verde
- [x] Subir o dev e exercitar os caminhos de erro, que custam zero

### Bloqueado por credenciais do usuário (CRED-1)

- [x] Verificar `UpstashRedisClient` contra Upstash real
- [x] Confirmar que o rate limit conta entre invocações distintas
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

- [x] **`REQUEST_TOO_EXPENSIVE` e `GUARD_UNAVAILABLE` NÃO TÊM PRODUTOR.**
      Varredura confirma: `analysisError('REQUEST_TOO_EXPENSIVE')` e
      `analysisError('GUARD_UNAVAILABLE')` não existem em lugar nenhum do
      código. Estão na união, mapeados a status e com mensagem — e inalcançáveis.
      **A Fase 2B precisa alcançá-los.** Se não alcançar, viram código morto com
      aparência de funcionalidade, que é achado real que este projeto já teve
      (o ramo `strongSource`, que nunca teve produtor).
- [x] **As cinco variáveis de ambiente novas não têm consumidor.**
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

---

## Registro de 2026-08-29 — Fases 2B e 3 concluídas

**O bloqueio de deploy foi levantado, e isso foi provado em execução:**

```
NODE_ENV=production, COM credenciais  -> RedisRateLimiter / RedisBudgetGuard
NODE_ENV=production, SEM credenciais  -> lanca AllowAllRateLimiter...
```

A guarda `assertNotProduction` continua protegendo exatamente o que devia: um
deploy mal configurado segue falhando alto, em vez de rodar sem defesa.

### Verificado contra Upstash real

| Operação | Resultado |
|---|---|
| `incrByWithTtl` cria e incrementa | 5, depois 8 |
| TTL aplicado só na criação | 59s restantes — **não deslizou** |
| `get` devolve string | `"8"` |
| `incrBy` negativo (a devolução) | 8 → 5 |
| Rate limiter, limite 2 | libera 2, recusa a 3ª com `Retry-After: 3600` |

O `NX` no `expire` é o que impede a janela de deslizar. Sem ele, tráfego
contínuo empurraria a expiração para sempre e o contador nunca venceria —
justamente sob abuso.

### Os dois oráculos, provados por sabotagem

Antes de aceitar o verde, removi cada proteção e exigi que o teste acusasse:

- **Pré-cobrança removida** (cobrar depois de checar): o teste de concorrência
  falhou com `expected 3110400 to be less than or equal to 1000000` — a versão
  sabotada deixou passar **3,1x o teto diário**. É o furo por paralelismo
  exatamente como a spec previa
- **Fail-closed trocado por fail-open**: o teste acusou
  `promise resolved "{ allowed: true }" instead of rejecting`

### Órfãos resolvidos

- `GUARD_UNAVAILABLE` ganhou **dois** produtores (limiter e budget guard)
- `REQUEST_TOO_EXPENSIVE` ganhou produtor no caso de uso, com teste próprio
- As **cinco** variáveis de ambiente ganharam consumidor no container

### Nota sobre o ambiente do usuário

O `.env.local` dele ainda tem `DAILY_TOKEN_BUDGET` e `MAX_TOKENS_PER_REQUEST`,
removidos do schema, e não tem as cinco novas. Verificado: `loadEnv` **aceita**
o arquivo — o Zod descarta chaves desconhecidas e os defaults entregam
exatamente os valores aprovados (US$1,00/dia, razão 0,70). Nada quebra; são
linhas mortas que vale limpar.

**445 testes** (eram 417). tsc, eslint e build verdes. Suíte roda sem credenciais.

---

## FASE 5 — Correção da revisão de 2026-08-29 (ADR-009)

A revisão achou um defeito crítico: a pré-cobrança nunca é desfeita quando a
etapa paga falha. **Medido: US$ 0,9931 de US$ 1,00 consumidos por 100 análises
que não gastaram um token.** Converte a defesa de custo em negação de serviço.

Ver [ADR-009](../../decisions/009-reserva-de-orcamento.md) para a decisão e a
razão de cada escolha. Ordem importa: o contrato antes dos implementadores.

### 5.1 — Contrato (sequencial, primeiro)

- [x] `src/core/ports/budget-guard.ts`: acrescentar `settle(estimatedInputTokens,
      actualUsage | null): Promise<void>` — **OBRIGATÓRIO**, não opcional
- [x] `src/core/domain/errors.ts`: `AnalysisError` ganha `partialUsage:
      ClassifierUsage | null = null`, e `analysisError()` passa a aceitá-lo
- [x] Verificar com `npx tsc --noEmit`: o compilador vai listar todo
      implementador de `BudgetGuard` que falta liquidar

### 5.2 — Implementadores

- [x] `UnlimitedBudgetGuard.settle` — no-op. Ele não conta nada, e isso é
      correto, não preguiça
- [x] `RedisBudgetGuard.settle` — recalcula o cobrado a partir de
      `estimatedInputTokens` (mesma função pura, mesmos argumentos), calcula o
      real (ou zero, se `actualUsage` for `null`), aplica o delta. **NUNCA lança**
- [x] `RedisCostRecorder` **PARA de escrever no contador** — vira só log. O
      contador passa a ter um dono só
- [x] `ClaudeClassifier`: ao lançar depois de ao menos um lote pago, anexar o
      `usage` acumulado como `partialUsage`. O dado já existe no laço; hoje é
      descartado

### 5.3 — Caso de uso

- [x] `analyze-url.ts`: envolver as etapas pagas em `try/finally` e liquidar
      SEMPRE que houve autorização
- [x] Sucesso → `settle(est, usoCompleto)`; falha com `partialUsage` →
      `settle(est, parcial)`; falha sem → `settle(est, null)`
- [x] O `finally` **não pode** engolir nem substituir o erro original

### 5.4 — Testes, com o padrão desta sessão

Cada um precisa FALHAR antes da correção. Verifique isso.

- [x] **A reprodução do defeito:** 100 análises que falham NÃO esgotam o teto.
      É a medição do Reviewer virando teste permanente
- [x] Falha sem gasto devolve integral — contador volta ao valor anterior
- [x] Falha com gasto parcial devolve só o não gasto
- [x] **Invariante "autorizou, liquidou"** — conta chamadas de `authorize` e
      `settle` num pipeline que falha
- [x] `settle` não lança com o Redis fora, e não mascara o erro do classificador

### 5.5 — Os dois achados menores da mesma revisão

- [x] **Teste de concorrência com número mágico errado.**
      `guards.test.ts:150` usa `15_552` micros por análise; o real é `19099` —
      subestima 18,6% e toleraria 64 autorizações quando o teto correto é 52.
      Trocar pela leitura do contador real via `client.espiar()`, que estava
      disponível o tempo todo
- [x] **Corrigir a árvore de arquivos no topo de `design.md`** — ela ainda lista
      nomes de teste que não existem (`redis-rate-limiter.test.ts` etc.) e
      afirma "nenhuma porta muda de assinatura", o que a ADR-009 tornou falso

---

## ⚠️ ITEM OBRIGATÓRIO DO SMOKE TEST EM PRODUÇÃO

Não é código, e não pode se perder: **ninguém verificou que a Vercel escreve
`x-vercel-forwarded-for`.** `client-key.ts` o trata como o cabeçalho mais
confiável.

Há risco nos dois sentidos, e nenhum produz erro visível:

- Se a Vercel **anexa** ao `x-forwarded-for` em vez de substituir, o valor mais
  à direita é o IP do proxy dela — **igual para todos os visitantes**. Todo
  mundo cairia num balde único de 10 análises/hora, e o produto pareceria
  quebrado sob qualquer tráfego
- Se ela não escrever nada, o cabeçalho volta a ser falsificável e o rate limit
  vira decorativo

**Como verificar em produção:** fazer duas requisições de origens diferentes e
confirmar que consomem baldes SEPARADOS, e inspecionar os cabeçalhos que de
fato chegam ao handler. Até isso ser feito, o rate limit por IP é premissa, não
fato.

### Registro da Fase 5 — 2026-08-29

**O defeito reproduzido e fechado, medido nos dois estados:**

```
COM a liquidação removida (o defeito original):
  100 analises falharam (zero token gasto)
  orcamento consumido: US$ 0.9931 de US$ 1.0000
  proxima analise legitima: allowed=false reason=daily_cap_reached

COM a correção:
  100 analises falharam (zero token gasto)
  orcamento consumido: US$ 0.0000 de US$ 1.0000
  proxima analise legitima: allowed=true reason=ok
```

A primeira linha reproduz exatamente a medição da revisão. A segunda é a
mesma execução depois da liquidação.

**Como se provou que os testes sabem falhar.** Removida a liquidação do
caminho de erro, os dois testes de invariante acusaram:
`expected [] to have a length of 1 but got +0` e
`expected undefined to deeply equal { inputTokens: 1700, … }`.

**O contrato obrigatório se pagou.** Ao acrescentar `settle` como método
requerido, `npx tsc --noEmit` listou os 6 pontos que faltavam liquidar —
dois adapters, o container e três stubs de teste. Como método opcional, nada
disso apareceria.

**Uma diferença de forma em relação à spec, sem diferença de efeito.** A ADR-009
descreve `try/finally`. A implementação usa `try/catch` no ponto da falha mais
a liquidação no caminho de sucesso. O motivo: um `finally` precisaria de uma
variável de controle para saber se já liquidou, e o `catch` explícito deixa
visível qual uso é passado em cada desfecho. A invariante — autorizou,
liquidou — é a mesma, e tem teste.

**453 testes** (eram 445). tsc, eslint e build verdes.

### Correção da revisão da Fase 5 — 2026-08-29

- [x] **A recusa não contabilizava o lote que já havia sido pago.**
      `addUsage` rodava DEPOIS da checagem de `stop_reason: 'refusal'`, então o
      lote recusado ficava fora do `partialUsage`. Consequências: recusa no
      primeiro lote devolvia a reserva INTEGRAL sobre uma chamada cobrada;
      recusa no lote N devolvia a mais o equivalente a um lote.
      Era o furo que a ADR-009 fechou, reintroduzido em outro ponto — e pior
      por ser acionável: `CLASSIFIER_REFUSED` depende do conteúdo enviado, e
      cada tentativa gastaria sem aparecer no contador.
      Corrigido movendo uma linha. Dois testes acrescentados, ambos falhando
      antes: `expected null not to be null` e `expected 1000 to be 1900`.

### ⚠️ Débito registrado: a invariante vale por inspeção, não por construção

A ADR-009 especificou `try/finally`; a implementação usa `try/catch` no ponto
da falha mais a liquidação no caminho de sucesso, e a diferença está declarada
acima.

O Reviewer confirmou que **não há caminho realista** em que a reserva fique
presa: `computeScore` não contém `throw`, o bloco de sugestões tem `catch`
próprio, e o que sobra entre as etapas 8 e 10 são operações puras.

**Mas a garantia depende do que há no meio, e o meio pode mudar.** Quem
acrescentar uma chamada entre o cálculo do score e a liquidação quebra a
invariante sem aviso e sem teste que pegue. Está registrado para que a próxima
pessoa saiba que a fragilidade é da forma escolhida, não descuido.

Se um dia isso incomodar, a correção é `try/finally` com sentinela de
liquidação — custa uma variável e devolve a garantia estrutural.
