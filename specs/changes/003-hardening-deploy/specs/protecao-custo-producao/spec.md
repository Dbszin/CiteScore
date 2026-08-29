# Spec Delta: Guardas de custo em produção

Complementa — **não substitui** — [`protecao-custo/spec.md`](../../../001-analisador-densidade-factual/specs/protecao-custo/spec.md)
da change 001. Aquele delta define as três defesas, as portas e os critérios
gerais, e continua valendo. Este acrescenta o que ele não diz: as
implementações de produção, e corrige três pontos onde ele diverge do medido.

## Current State

- Portas `RateLimiter`, `BudgetGuard` e `CostRecorder` definidas e congeladas.
- `AllowAllRateLimiter` e `UnlimitedBudgetGuard` existem para dev e teste, e
  **lançam sob `NODE_ENV=production`** via `assertNotProduction`.
- `ConsoleCostRecorder` registra custo no log do servidor.
- Consequência: **o deploy público falha no primeiro request, de propósito.** É
  a guarda funcionando, não um bug.

## Changes

### ADDED

- **`RedisClient`** — interface estreita com cinco operações. Mesma estratégia de
  `AnthropicLike`: isola a biblioteca externa e torna tudo testável sem rede.
- **`UpstashRedisClient`** — implementação sobre a **API REST** do Upstash.
  Serverless não mantém conexão TCP viva entre invocações; cliente de protocolo
  Redis tradicional não serve.
- **`FakeRedisClient`** — em memória, com relógio injetável e capacidade de
  simular indisponibilidade. É o que permite implementar e testar a change
  inteira **antes de as credenciais existirem**.
- **`RedisRateLimiter`** — janela fixa horária por `clientKey`.
- **`RedisBudgetGuard`** — teto diário em dólares, com pré-cobrança.
- **`RedisCostRecorder`** — registra uso e reconcilia o contador com o custo real.
- **Três códigos de erro:** `REQUEST_TOO_EXPENSIVE`, `GUARD_UNAVAILABLE`, e
  `BUDGET_EXCEEDED` reservado ao teto diário.

### MODIFIED

**1. `BUDGET_EXCEEDED` passa de 429 para 503.**

O delta original diz 503 e o código publicado usa 429. A spec estava certa.

429 afirma *"você fez requisições demais"*. O teto diário é global — consumido
por todos os visitantes somados. Quem fez uma única requisição e recebe 429 é
informado de algo falso sobre o próprio comportamento. 503 descreve o que de
fato ocorre: o serviço está sem orçamento até amanhã.

429 permanece em `RATE_LIMITED`, onde é verdadeiro.

**2. As duas recusas do `BudgetGuard` deixam de ser colapsadas.**

`BudgetDecision.reason` já distingue `request_too_expensive` de
`daily_cap_reached`, e a rota mapeava ambos para o mesmo código. São opostos do
ponto de vista de quem está na tela: um é resolvível trocando de artigo, o outro
não é resolvível hoje. Apresentar os dois igual transforma um problema com saída
em um beco aparente.

**3. O teto sai de tokens e passa para dólares.**

`DAILY_TOKEN_BUDGET` e `MAX_TOKENS_PER_REQUEST` contam **tokens de entrada**. No
`claude-haiku-4-5` a entrada custa US$ 1/MTok e a saída US$ 5/MTok. Na análise
real medida — 4.244 de entrada, 2.261 de saída — a **saída respondeu por 73% do
custo**. Um teto sobre a entrada limita a parte barata do gasto.

O valor atual, 2.000.000 tokens de entrada, vale US$ 2,00 só de entrada, contra
o teto de **US$ 1,00/dia** aprovado pelo usuário. O parâmetro contradiz a decisão.

Entram `DAILY_BUDGET_USD`, `MAX_REQUEST_BUDGET_USD`, os dois preços por milhão
de tokens, e `BUDGET_OUTPUT_RATIO`.

**4. Os números de referência do delta 001 estão desatualizados.**

Ele projeta ~US$ 0,13 por análise e "mil requisições abusivas custam ~US$ 130".
O custo **medido** é **US$ 0,0155** — mil requisições custam ~US$ 15,50.

Continua inaceitável sem guarda. Mas o número certo importa: as três defesas
foram dimensionadas sobre um valor 8x maior.

### REMOVED

- `DAILY_TOKEN_BUDGET`, `MAX_TOKENS_PER_REQUEST` — substituídos por tetos em
  dólares.

### UNCHANGED

- As três portas. Esta change troca implementações, não contratos.
- `AllowAllRateLimiter`, `UnlimitedBudgetGuard` e `assertNotProduction` —
  continuam existindo e continuam lançando em produção. São a rede que garante
  que um deploy mal configurado falhe alto.
- `MAX_CONTENT_BYTES`, `MAX_ANALYZABLE_SENTENCES`, `MAX_SENTENCES_PER_LLM_CALL`.

## Decisões com razão registrada

### Redis indisponível: falha FECHADA

Falhar aberto significa servir sem limite exatamente quando não se sabe quanto já
foi gasto. E transforma a dependência em **vetor de ataque**: o free tier tem
limite de requisições, e quem quiser desligar as defesas só precisa esgotá-lo.
A proteção passaria a ser desativável por quem ela deveria conter.

Custo aceito: durante indisponibilidade do Upstash, o site responde 503. Para
ferramenta gratuita, indisponível é melhor que fatura inesperada.

### Pré-cobrança antes da chamada, reconciliação depois

`authorize` incrementa o contador com a estimativa **antes** de liberar. Cobrar
só depois deixaria N invocações simultâneas lerem o mesmo saldo e se aprovarem
todas — furando o teto por paralelismo, que é o cenário de abuso.

Recusa devolve o valor pré-cobrado: requisição recusada não gastou nada, e
deixá-la consumir orçamento faria o teto se esgotar sozinho sob ataque.

### Seleção por credencial, não por ambiente

Presença de `REDIS_URL` e `REDIS_TOKEN` seleciona os adapters de produção.
Permite exercitar os adapters reais localmente, e mantém o deploy mal
configurado falhando alto em vez de rodar sem defesa em silêncio.

## EMENDA — ciclo de vida da reserva ([ADR-009](../../../../decisions/009-reserva-de-orcamento.md))

Este delta descreveu a pré-cobrança e a reconciliação assumindo que a etapa
paga sempre termina. Ela nem sempre termina, e a omissão criou um defeito
grave: a defesa de custo virou negação de serviço.

### MODIFIED

**A porta `BudgetGuard` ganha `settle`, obrigatório.**

Não opcional. Uma implementação que não liquide reintroduz o vazamento sem
produzir erro nenhum, e método opcional deixaria isso passar despercebido.

`settle(estimatedInputTokens, actualUsage | null)`:
- recebe o MESMO `estimatedInputTokens` passado a `authorize`, e reproduz o
  valor cobrado aplicando a mesma função pura aos mesmos argumentos
- `actualUsage` é o uso completo no sucesso, o uso **parcial** quando a chamada
  falhou depois de lotes já pagos, e `null` quando nada foi gasto
- **nunca lança**

**`AnalysisError` ganha `partialUsage` opcional.** O `ClaudeClassifier` já
acumula `usage` a cada lote bem-sucedido e o descartava ao lançar. O dado
existia; faltava carregá-lo.

**O `CostRecorder` para de escrever no contador diário.** Passa a ser só
observabilidade, como o nome diz. Dois componentes escrevendo na mesma chave,
um recalculando o que o outro cobrou, foi o arranjo que escondeu os defeitos.

### O segundo defeito que isto corrige

O `RedisCostRecorder` recalculava a pré-cobrança a partir de
`usage.inputTokens`. Mas o que foi cobrado veio de `estimateInputTokens()`
(`countTokens`), e `usage.inputTokens` vem da resposta da API — números
próximos, não iguais.

Mesmo no caminho feliz a reconciliação errava um pouco, todo dia. Liquidar a
partir do mesmo insumo da autorização elimina isso.

### Regras que não podem ser violadas

1. **Autorizou, liquidou.** O caso de uso liquida em `finally`. Não existe
   caminho em que uma reserva sobreviva à requisição que a criou.
2. **Falha sem gasto devolve integral.** É o que fecha o vetor de DoS.
3. **Falha com gasto parcial devolve só o não gasto.** Devolver a estimativa
   inteira zeraria o contador sobre dinheiro real — o furo oposto.
4. **`settle` nunca lança.** No caminho de erro, mascarar a causa original com
   um erro de contabilidade esconde o problema de quem for investigar.
5. **Falha ao liquidar mantém a reserva.** Erra para o lado caro; a chave
   expira em 48h e o erro não atravessa dias.

### Limite conhecido, aceito

Se o processo morrer entre `authorize` e `settle` — timeout duro da função
serverless —, a reserva fica até expirar. Fechar isso exigiria reserva com TTL
curto e renovação, complexidade que este produto não justifica.

## Acceptance Criteria

- [ ] Deploy **com** credenciais sobe e responde; **sem** credenciais continua
      falhando no primeiro request.
- [ ] Nenhum caminho chama a Claude API antes de `rateLimiter.check` e
      `budgetGuard.authorize` — o teste de ordem existente continua verde.
- [ ] Rate limit excedido retorna **429** com `Retry-After` do TTL real, e **não**
      faz fetch.
- [ ] Teto diário atingido retorna **503** `BUDGET_EXCEEDED` com `Retry-After`
      até a virada do dia UTC.
- [ ] Análise acima do teto por requisição retorna **413** `REQUEST_TOO_EXPENSIVE`
      com mensagem acionável.
- [ ] Redis indisponível retorna **503** `GUARD_UNAVAILABLE` — nunca serve sem
      limite.
- [ ] Duas autorizações concorrentes não furam o teto (pré-cobrança).
- [ ] Autorização recusada devolve o valor pré-cobrado.
- [ ] `RedisCostRecorder` aplica o delta entre custo real e estimado, e **nunca
      lança** — falha de contabilidade não derruba análise concluída.
- [ ] O custo é calculado sobre entrada **e** saída estimada, não só entrada.
- [ ] Testes de janela usam `FixedClock`, não relógio do sistema.
- [ ] Suíte inteira roda **sem credenciais**, com `FakeRedisClient`.
- [ ] Nenhuma variável com segredo prefixada `NEXT_PUBLIC_`.
- [ ] **Falha do classificador SEM gasto devolve a reserva integral** — o
      contador volta ao valor anterior à autorização.
- [ ] **Falha do classificador COM gasto parcial devolve só o não gasto** — o
      contador reflete o que a Anthropic de fato cobrou.
- [ ] **Toda autorização é liquidada**, verificado por teste que conta
      `authorize` e `settle` num pipeline que falha.
- [ ] **`settle` não lança nem quando o Redis está fora**, e não mascara o erro
      original do classificador.
- [ ] **100 análises que falham NÃO esgotam o teto** — é a reprodução direta do
      defeito medido (US$ 0,9931 de US$ 1,00 consumidos sem gasto real).
