# Proposta: Hardening para deploy público

## Por que agora

O produto funciona. Uma URL entra pela tela, o relatório sai, e isso foi
verificado em uso real. O que impede a publicação não é funcionalidade — é que
**o deploy falha no primeiro request, de propósito**.

`AllowAllRateLimiter` e `UnlimitedBudgetGuard` chamam `assertNotProduction` no
construtor e lançam sob `NODE_ENV=production`. Essa guarda foi escrita
deliberadamente, e ela está certa: os dois adapters desligam as defesas que
`protecao-custo/spec.md` marca como bloqueadoras de deploy público. Um endpoint
anônimo que gasta dinheiro em LLM a cada requisição sem teto não é um produto,
é uma fatura esperando para acontecer.

Esta change entrega os adapters de produção que aquela guarda está esperando, e
fecha a última brecha de SSRF conhecida.

## Escopo

### Dentro

1. **`RedisRateLimiter`** — janela por IP, contador fora do processo.
2. **`RedisBudgetGuard`** — teto diário em dólares, com pré-cobrança e
   reconciliação pelo uso real.
3. **`RedisCostRecorder`** — registra o uso e ajusta o contador diário para o
   custo que de fato ocorreu.
4. **Fechamento do TOCTOU / DNS rebinding** conforme [ADR-008](../../decisions/008-validacao-no-caminho-de-conexao.md).
5. **Reconciliação de três divergências** entre a spec de proteção de custo e o
   código publicado (status HTTP, granularidade da recusa, e os números).
6. **Seleção de adapter no container** sem quebrar a instanciação preguiçosa.

### Fora

- **O deploy em si.** Depende de credenciais que só o usuário tem.
- **A escala do score** (ADR-007) e o design final da UI. Continuam bloqueados
  pela OQ-3 e não têm relação com publicar ou não.
- **Change 002** (pré-filtro vira anotador). Não bloqueia deploy.
- **`ClaudeSuggestionWriter`.** O adapter no-op atual não gasta e não mente.
- **Autenticação, banco, histórico.** Fora do v1 por decisão de produto.

## As três divergências, e por que elas importam agora

Elas foram descobertas ao preparar esta change. Nenhuma é urgente hoje, porque
as defesas ainda não estão ligadas — mas todas viram comportamento público no
momento do deploy, e corrigir depois é mudar contrato já exposto.

### 1. `BUDGET_EXCEEDED` responde 429; a spec diz 503

**Decisão: 503.**

429 significa *"você fez requisições demais"*. O teto diário é **global** — ele é
consumido por todos os visitantes somados. Um usuário que fez uma única
requisição e recebe 429 está sendo informado de algo factualmente falso sobre o
próprio comportamento.

503 significa *"o serviço está temporariamente indisponível"*, que é exatamente o
que acontece: acabou o orçamento do dia, volta amanhã. Ambos aceitam
`Retry-After`, então não se perde nada em capacidade de resposta.

O 429 fica onde ele é verdadeiro: no `RATE_LIMITED`, que **é** por cliente.

### 2. Duas recusas diferentes colapsadas em um código

O `BudgetGuard` já distingue `request_too_expensive` de `daily_cap_reached`, e a
rota mapeia as duas para `BUDGET_EXCEEDED`. São situações opostas do ponto de
vista de quem está na tela:

| Situação | O usuário pode fazer algo? |
|---|---|
| Este artigo é grande demais para o limite por requisição | **Sim** — tentar um artigo menor |
| A cota do dia acabou | **Não** — só esperar |

Apresentar as duas com a mesma mensagem transforma um problema resolvível em um
beco sem saída aparente. Entram **`REQUEST_TOO_EXPENSIVE`** (413) e o
`BUDGET_EXCEEDED` fica reservado ao teto diário.

### 3. As defesas foram dimensionadas sobre um número 8x maior

`protecao-custo/spec.md` projeta ~US$ 0,13 por análise. O custo **medido** pela
rota real é **US$ 0,0155**.

Pior que a diferença: `DAILY_TOKEN_BUDGET` conta **tokens de entrada**, e no
`claude-haiku-4-5` a entrada custa US$ 1/MTok contra US$ 5/MTok da saída. Na
análise medida, a saída respondeu por **73% do custo**. Um teto expresso em
tokens de entrada não limita o gasto — limita a parte barata dele.

O valor atual, 2.000.000 tokens de entrada, vale US$ 2,00 só de entrada. O teto
aprovado pelo usuário é **US$ 1,00/dia**. O parâmetro contradiz a decisão.

**Decisão: o teto passa a ser denominado em dólares.**

## Restrições

- **ADR-001 continua valendo.** `src/core/**` não conhece Redis, não conhece
  Upstash, não conhece socket. Tudo isto são adapters.
- **A instanciação preguiçosa do container é obrigatória.** Foi verificada em
  execução e é o que faz `next build` passar. Nenhum adapter pode nascer em
  tempo de módulo.
- **As portas estão congeladas.** `RateLimiter`, `BudgetGuard` e `CostRecorder`
  não mudam de assinatura. Esta change troca implementações, não contratos de
  porta.
- **A implementação não pode depender das credenciais.** O usuário está ausente
  e o Upstash exige conta dele. O design isola o cliente Redis atrás de uma
  interface estreita — o mesmo padrão de `AnthropicLike`, que já se provou neste
  projeto — para que a lógica inteira seja testável com cliente falso.

## Critério de pronto

Esta change está completa quando:

1. Um deploy com `REDIS_URL` e `REDIS_TOKEN` presentes **sobe** e responde.
2. Um deploy **sem** essas variáveis continua falhando alto, como hoje.
3. Existe teste que prova, em execução, que o socket não consegue conectar em
   endereço não validado.
4. Nenhum caminho chama a Claude API antes das duas guardas.
5. Redis indisponível resulta em recusa, não em serviço sem limite.
