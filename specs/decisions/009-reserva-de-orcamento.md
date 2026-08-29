# ADR-009: O contador de orçamento tem um dono, e toda reserva é liquidada

- **Status:** aceita
- **Data:** 2026-08-29
- **Contexto de:** [003-hardening-deploy](../changes/003-hardening-deploy/)
- **Emenda:** o `design.md` da change 003, seção do `RedisBudgetGuard`
- **Relaciona-se com:** [ADR-001](001-arquitetura-hexagonal.md), [ADR-005](005-modelo-llm-e-custo.md)

## Contexto

A change 003 especificou pré-cobrança: `authorize()` incrementa o contador
diário com a estimativa **antes** de liberar a chamada paga, e o `CostRecorder`
aplica depois o delta entre custo real e estimado.

A pré-cobrança em si está certa e é necessária — sem ela, N invocações
simultâneas leem o mesmo saldo e se aprovam todas, furando o teto por
paralelismo. Isso foi verificado: removê-la deixa passar 3,1x o orçamento.

**O que a spec não descreveu foi o caminho de falha.** Ela desenhou o ciclo
"cobra, gasta, reconcilia" assumindo que a etapa paga sempre termina. Quando
`classify()` lança, a reconciliação nunca acontece e a cobrança fica.

Medido em execução:

```
100 análises FALHARAM (zero token gasto de verdade)
orçamento consumido: US$ 0,9931 de US$ 1,00
próxima análise legítima: recusada, daily_cap_reached
```

Isso inverte o propósito da defesa. Quem provocar recusas do modelo — enviando
conteúdo que ele se negue a classificar — derruba o produto pelo resto do dia
**a custo zero**. E uma indisponibilidade do provedor produz o mesmo efeito sem
ninguém agir de má-fé.

### A armadilha da correção óbvia

Devolver a estimativa inteira quando `classify()` lança **vaza para o outro
lado**. O `ClaudeClassifier` particiona as sentenças em lotes e faz uma chamada
paga por lote; falhar no terceiro de cinco significa que os dois primeiros já
foram cobrados pela Anthropic. Devolver tudo zeraria o contador sobre dinheiro
realmente gasto — furo no teto, que é o que o guard existe para impedir.

### O que a investigação revelou

Não é preciso escolher entre os dois vazamentos, porque **a informação exata já
existe**. Em `claude-classifier.ts`, `usage` é acumulado após cada lote
bem-sucedido e descartado no `throw`. O classificador sabe precisamente quanto
foi gasto quando falha; o contrato é que não tem como dizer.

### Um segundo defeito, na mesma costura

Ao mapear o ciclo, apareceu um problema que ninguém tinha reportado: o
`RedisCostRecorder` **recalcula** a pré-cobrança a partir de `usage.inputTokens`
para achar o delta. Mas o que foi cobrado veio de `estimateInputTokens()`
(`countTokens`), e `usage.inputTokens` vem da resposta da API. Os dois números
são próximos, não iguais.

Ou seja: mesmo no caminho feliz a reconciliação erra um pouco, todo dia, para
um lado que ninguém controla. O erro é pequeno por análise e acumula no
contador.

A causa é a mesma do problema principal: **o valor cobrado nunca foi carregado
explicitamente — sempre foi inferido.**

## Decisão

### 1. Toda autorização é liquidada, sempre

A porta `BudgetGuard` ganha `settle`. O caso de uso liquida em `finally`: se
autorizou, liquida, dê certo ou não.

- Sucesso → liquida com o uso real
- Falha com gasto parcial → liquida com o uso parcial que o classificador
  reporta
- Falha sem gasto nenhum → liquida com `null`, e a reserva é devolvida integral

Não há caminho em que uma reserva sobreviva à requisição que a criou.

### 2. O guard recalcula o que cobrou a partir do MESMO insumo

`settle` recebe o `estimatedInputTokens` que foi passado a `authorize`. Como a
precificação é uma função pura dos mesmos argumentos, o guard reproduz
exatamente o valor que cobrou — sem inferir, sem drift.

Isso corrige o segundo defeito de graça.

### 3. O contador diário passa a ter UM dono

O `CostRecorder` deixa de tocar o contador e volta a ser o que o nome diz:
observabilidade. Quem escreve no contador é só o `BudgetGuard`.

Dois componentes escrevendo na mesma chave, um deles recalculando o que o outro
cobrou, era o arranjo que escondeu os dois defeitos. Um dono, um ciclo de vida.

### 4. O classificador reporta o que já foi pago ao falhar

`AnalysisError` ganha `partialUsage` opcional. O `ClaudeClassifier` o preenche
ao lançar depois de pelo menos um lote bem-sucedido.

É acréscimo, não reescrita: o dado já é acumulado, só era descartado.

### 5. `settle` NUNCA lança

Mesma postura do `CostRecorder`, e pelo mesmo motivo: liquidar acontece depois
do trabalho, e derrubar uma análise concluída por causa da contabilidade troca
valor entregue por precisão de contador. No caminho de falha há uma razão
adicional — mascarar o erro original com um de contabilidade esconderia a causa
real de quem for investigar.

Quando `settle` falha, a reserva permanece. Erra para o lado caro, e a chave
expira em 48h, então o erro não atravessa dias.

## Consequências

### O que melhora

- O vetor de negação de serviço fecha: falha sem gasto devolve integral.
- O teto continua íntegro sob falha parcial: devolve só o que não foi gasto.
- O drift silencioso do caminho feliz some.
- O ciclo de vida vira explícito e verificável — "toda reserva é liquidada" é
  uma invariante que dá para testar, não uma intenção.

### O que custa

- **Mudança de contrato numa porta.** `settle` é obrigatório, não opcional:
  uma implementação que não liquide reintroduz o vazamento em silêncio, e
  método opcional deixaria isso passar. `UnlimitedBudgetGuard` satisfaz com
  no-op, o que é correto — ele não conta nada.
- **Uma ida a mais ao Redis por análise.** Sobre ~10s de análise, é ruído.
- **`partialUsage` no `AnalysisError`** acopla levemente o erro à contabilidade.
  Aceito: a alternativa era o classificador reportar por um canal paralelo, o
  que separaria dois fatos que nasceram juntos.

### O que fica em aberto

Se o processo morrer entre `authorize` e `settle` — timeout duro da função
serverless, por exemplo — a reserva fica até expirar. É o mesmo lado seguro de
sempre, e fechar isso exigiria reserva com TTL curto e renovação, complexidade
que este produto não justifica. **Registrado, não resolvido.**

## Alternativas descartadas

- **Devolver a estimativa inteira em qualquer falha.** Simples e errada: zera o
  contador sobre gasto real quando a falha é parcial.
- **Não devolver nada.** É o estado atual, e é o defeito.
- **Cobrar só depois da chamada.** Elimina o vazamento e reabre o furo por
  paralelismo, que é pior — foi medido em 3,1x o teto.
- **Reserva opaca (`handle`) devolvida por `authorize`.** Mais elegante e mais
  contrato para carregar. Recalcular a partir de `estimatedInputTokens` é
  determinístico e resolve o mesmo problema com menos superfície.
