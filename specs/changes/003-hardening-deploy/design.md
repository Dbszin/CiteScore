# Design: Hardening para deploy público

## Estrutura de arquivos

```
src/
├── adapters/
│   ├── budget/
│   │   ├── unlimited-budget-guard.ts        [MANTIDO] dev/teste, lança em prod
│   │   └── redis-budget-guard.ts            [NOVO]    teto diário em dólares
│   ├── config/
│   │   ├── container.ts                     [MODIFICADO] seleção dev/prod
│   │   ├── env.ts                           [MODIFICADO] teto em dólares
│   │   └── assert-not-production.ts         [MANTIDO]
│   ├── fetch/
│   │   ├── http-content-fetcher.ts          [MODIFICADO] validação no connect
│   │   ├── validating-lookup.ts             [NOVO]    a função de resolução
│   │   └── private-address.ts               [INTOCADO] lógica pura já correta
│   ├── ratelimit/
│   │   ├── allow-all-rate-limiter.ts        [MANTIDO] dev/teste, lança em prod
│   │   └── redis-rate-limiter.ts            [NOVO]    janela por IP
│   └── redis/
│       ├── redis-client.ts                  [NOVO]    interface estreita
│       ├── upstash-client.ts                [NOVO]    implementação REST
│       ├── fake-redis-client.ts             [NOVO]    para teste, sem rede
│       └── redis-cost-recorder.ts           [NOVO]    reconcilia o contador
├── app/api/analyze/
│   ├── error-status.ts                      [MODIFICADO] 3 códigos novos
│   └── route.ts                             [MODIFICADO] Retry-After
└── core/
    └── domain/errors.ts                     [MODIFICADO] união de erros

tests/
├── adapters/
│   ├── fetch/toctou.test.ts                 [NOVO] prova a pinagem
│   ├── redis/redis-rate-limiter.test.ts     [NOVO]
│   ├── redis/redis-budget-guard.test.ts     [NOVO]
│   └── redis/redis-cost-recorder.test.ts    [NOVO]
└── contract/error-status.test.ts            [MODIFICADO]
```

`src/core/**` ganha apenas três valores na união de erros. Nenhuma porta muda de
assinatura, e nada em `core` passa a conhecer Redis ou socket.

---

## [Padrões Aplicados]

**Ports & Adapters (ADR-001).** Redis é detalhe de infraestrutura e vive
inteiramente em `src/adapters/`. As portas `RateLimiter`, `BudgetGuard` e
`CostRecorder` já existiam e **não mudam** — foi exatamente para este momento que
foram desenhadas. A troca de `AllowAllRateLimiter` por `RedisRateLimiter` não
atravessa a fronteira do domínio.

**Interface estreita sobre biblioteca externa (o padrão `AnthropicLike`).** Em
vez de depender do tipo concreto do `@upstash/redis`, define-se `RedisClient`
com os cinco métodos que de fato usamos. Isso dá três coisas: testabilidade sem
rede e sem credenciais — decisivo aqui, porque o usuário está ausente —,
independência de mudanças de assinatura da biblioteca, e uma superfície pequena
o bastante para ser lida inteira. Este projeto já validou o padrão com
`AnthropicLike`.

**Decorator no `CostRecorder`.** `RedisCostRecorder` registra o uso **e**
reconcilia o contador diário. Não é um novo conceito: é a porta existente
fazendo, na implementação de produção, o que a de desenvolvimento não precisa
fazer.

**Injeção da resolução de nomes (ADR-008).** A função de resolução vira um ponto
de extensão do transporte. O `AddressResolver` injetável que já existe em
`HttpContentFetcher` deixa de ser usado como pré-checagem e passa a ser a fonte
única de endereços do socket.

**Fail-closed como política, não como exceção.** Toda indisponibilidade de
guarda resulta em recusa. Ver a seção de resiliência.

---

## Contratos

### Domínio: três códigos de erro

```typescript
// src/core/domain/errors.ts — acréscimos à união fechada

export type AnalysisErrorCode =
  // ... códigos existentes ...
  | 'RATE_LIMITED'            // 429 — por cliente, e verdadeiro
  | 'BUDGET_EXCEEDED'         // 503 — teto DIÁRIO, global, não acionável
  | 'REQUEST_TOO_EXPENSIVE'   // 413 — este artigo específico, acionável
  | 'GUARD_UNAVAILABLE';      // 503 — a guarda não pôde decidir
```

Mensagens ao usuário, que precisam refletir a diferença de acionabilidade:

| Código | Mensagem | O usuário pode agir? |
|---|---|---|
| `REQUEST_TOO_EXPENSIVE` | "Este artigo é grande demais para o limite de análise. Tente um texto menor." | Sim |
| `BUDGET_EXCEEDED` | "O limite diário de análises foi atingido. Tente novamente amanhã." | Não |
| `GUARD_UNAVAILABLE` | "O serviço está temporariamente indisponível. Tente novamente em instantes." | Não |

### Cliente Redis: a interface estreita

```typescript
// src/adapters/redis/redis-client.ts

/**
 * Só o que o produto usa. Upstash sobre REST — a Vercel serverless não
 * mantém conexão TCP viva entre invocações.
 */
export interface RedisClient {
  /** `null` quando a chave não existe. */
  get(key: string): Promise<string | null>;
  /** Devolve o valor DEPOIS do incremento. Atômico. */
  incrBy(key: string, amount: number): Promise<number>;
  /** Segundos. Idempotente: reaplicar não estende indefinidamente se já houver TTL. */
  expire(key: string, seconds: number): Promise<void>;
  /** Segundos restantes; negativo quando não há TTL ou a chave não existe. */
  ttl(key: string): Promise<number>;
  /** Incremento + expiração numa ida só. Reduz latência e risco de chave órfã. */
  incrByWithTtl(key: string, amount: number, ttlSeconds: number): Promise<number>;
}

export class RedisUnavailableError extends Error {
  constructor(readonly operation: string, override readonly cause?: unknown) {
    super(`Redis indisponível durante ${operation}`);
    this.name = 'RedisUnavailableError';
  }
}
```

A implementação `UpstashRedisClient` recebe URL e token e traduz falha de rede,
timeout e status não-2xx em `RedisUnavailableError`. `FakeRedisClient` implementa
a mesma interface em memória, com relógio injetável, e permite simular
indisponibilidade — é o que torna a suíte inteira executável sem credenciais.

### `RedisRateLimiter`

```typescript
// src/adapters/ratelimit/redis-rate-limiter.ts

export interface RedisRateLimiterOptions {
  readonly requestsPerHour: number;
  /** Prefixo de chave. Permite compartilhar uma instância Redis entre ambientes. */
  readonly keyPrefix: string;
}

export class RedisRateLimiter implements RateLimiter {
  constructor(
    client: RedisClient,
    clock: Clock,
    options: RedisRateLimiterOptions,
  );

  /** @throws AnalysisError GUARD_UNAVAILABLE quando o Redis não responde */
  check(clientKey: string): Promise<RateLimitDecision>;
}
```

**Algoritmo: janela fixa horária.** Chave `{prefix}:rl:{clientKey}:{horaUTC}`,
`incrByWithTtl(key, 1, 3600)`. Se o valor devolvido exceder o limite, recusa.

**Trade-off aceito e declarado:** janela fixa permite rajada de até 2× o limite na
virada da hora — 20 requisições em poucos segundos com o limite em 10. Para uma
defesa de custo cujo objetivo é impedir consumo *sustentado*, isso é irrelevante:
20 análises custam ~US$ 0,31, e o budget guard diário continua sendo o teto real.
Janela deslizante custaria uma estrutura de dados maior e mais idas ao Redis por
requisição, comprando precisão que este produto não precisa.

**`retryAfterSeconds`** vem do `ttl` da chave, não de um valor fixo: é o tempo
real até a janela virar.

### `RedisBudgetGuard`

```typescript
// src/adapters/budget/redis-budget-guard.ts

/** Preços por milhão de tokens, em micro-dólares, para evitar float. */
export interface ModelPricing {
  readonly inputMicrosPerMillion: number;   // haiku-4-5: 1_000_000
  readonly outputMicrosPerMillion: number;  // haiku-4-5: 5_000_000
}

export interface RedisBudgetGuardOptions {
  readonly dailyBudgetMicros: number;
  readonly maxRequestMicros: number;
  readonly pricing: ModelPricing;
  /**
   * Saída estimada como fração da entrada.
   *
   * MEDIDO: 2.261 tokens de saída para 4.244 de entrada = 0,53. O default
   * carrega margem porque subestimar aqui é exatamente a falha que o guard
   * existe para prevenir.
   */
  readonly outputRatio: number;
  readonly keyPrefix: string;
}

export class RedisBudgetGuard implements BudgetGuard {
  constructor(
    client: RedisClient,
    clock: Clock,
    options: RedisBudgetGuardOptions,
  );

  /** @throws AnalysisError GUARD_UNAVAILABLE quando o Redis não responde */
  authorize(estimatedInputTokens: number): Promise<BudgetDecision>;
}
```

**Precificação do pré-flight.** O guard recebe apenas tokens de entrada — é o que
a porta oferece, e a porta não muda. A saída é estimada por `outputRatio`:

```
custoMicros = entrada × precoEntrada + (entrada × outputRatio) × precoSaida
```

Contar só a entrada seria enganoso: na análise medida a saída respondeu por
**73%** do custo. Um teto sobre a entrada limitaria a parte barata.

**Duas recusas distintas**, já previstas em `BudgetDecision.reason`:

| Condição | `reason` | Erro na borda |
|---|---|---|
| `custoMicros > maxRequestMicros` | `request_too_expensive` | `REQUEST_TOO_EXPENSIVE` (413) |
| `gastoDoDia + custoMicros > dailyBudgetMicros` | `daily_cap_reached` | `BUDGET_EXCEEDED` (503) |

**Pré-cobrança e reconciliação.** `authorize` faz `incrByWithTtl` da estimativa
na chave `{prefix}:budget:{YYYY-MM-DD}` com TTL de 48h. Depois da chamada real, o
`RedisCostRecorder` aplica o **delta** entre custo real e estimado.

Isto é deliberado e a ordem importa: cobrar antes fecha a janela de concorrência
em que N invocações simultâneas leem o mesmo saldo e todas se aprovam. Cobrar
depois deixaria o teto ser furado por paralelismo, que é precisamente o cenário
de abuso.

**Recusa devolve o valor pré-cobrado.** Uma requisição recusada não gastou nada e
não pode consumir orçamento; caso contrário o teto se esgota sozinho sob ataque.

**`retryAfterSeconds`** para `daily_cap_reached` são os segundos até a virada do
dia UTC, obtidos do `ttl` da chave.

### `RedisCostRecorder`

```typescript
// src/adapters/redis/redis-cost-recorder.ts

export class RedisCostRecorder implements CostRecorder {
  constructor(
    client: RedisClient,
    clock: Clock,
    options: { pricing: ModelPricing; keyPrefix: string },
  );

  /**
   * Registra o uso e aplica ao contador diário a DIFERENÇA entre o custo real
   * e o que foi pré-cobrado. O delta pode ser negativo.
   *
   * NUNCA lança: registro de custo não é caminho crítico, e derrubar uma
   * análise concluída porque a contabilidade falhou seria trocar valor
   * entregue por precisão de contador. Falha vira log.
   */
  record(usage: ClassifierUsage, model: string): Promise<void>;
}
```

Isto responde à pergunta *"o budget guard precisa do custo real?"*: **precisa**.
Sem reconciliação o contador acumula a estimativa, que carrega margem de
segurança, e o teto de US$ 1 seria atingido com bem menos de US$ 1 gasto.

Há uma assimetria proposital: o **guard** falha fechado, o **recorder** nunca
falha. O guard decide se gasta; o recorder apenas contabiliza depois do gasto.

### Fetcher: a resolução validadora

```typescript
// src/adapters/fetch/validating-lookup.ts

/** Assinatura que `net.connect` espera. */
export type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | { address: string; family: number }[],
  family?: number,
) => void;

export interface ValidatingLookupOptions {
  /** Injetável para teste. Default: dns.lookup. */
  readonly resolve?: AddressResolver;
  /** Chamado a cada resolução. Torna a pinagem observável em teste. */
  readonly onResolved?: (hostname: string, addresses: readonly string[]) => void;
}

/**
 * Resolve o nome e devolve APENAS endereços aprovados.
 *
 * ADR-008: esta função é a única fonte de endereços do socket. Não existe
 * caminho pelo qual um endereço não validado chegue à conexão, porque não há
 * segunda resolução.
 *
 * Falha fechada: qualquer endereço bloqueado no conjunto rejeita o nome
 * INTEIRO. Um hostname que aponta ao mesmo tempo para IP público e para
 * 169.254.169.254 é a assinatura do ataque, não uma configuração legítima.
 */
export function createValidatingLookup(
  options?: ValidatingLookupOptions,
): (hostname: string, opts: unknown, callback: LookupCallback) => void;
```

O `HttpContentFetcher` deixa de chamar `assertPublicHost` como passo separado.
`isBlockedHostname` **continua** na validação da URL — ela é sintática, roda
antes de qualquer I/O e é barata.

**`private-address.ts` não muda.** A lógica pura está correta e coberta por 53
casos. O que muda é onde ela é invocada.

---

## [Estratégia de Implementação]

### Fase 1 — Contratos compartilhados (sequencial, primeiro)

Os três códigos de erro, as mensagens, o mapa de status e as variáveis de
ambiente. **Ambos os componentes dependem desta fase**, e é por isso que ela não
paraleliza. A união fechada faz o compilador listar tudo que falta mapear.

### Fase 2 — Dois componentes independentes (paralelizável)

**A: fetch sem TOCTOU.** Rota A da ADR-008 primeiro. A prova em execução é o
critério de aceite, não o teste de que a requisição funciona.

**B: guardas Redis.** `RedisClient` e `FakeRedisClient` antes de tudo; os três
adapters contra a interface, testados com o cliente falso e `FixedClock`.

Não compartilham arquivo algum. O conflito estaria em `container.ts`, que é fase 3.

### Fase 3 — Integração (sequencial)

Seleção no container: **presença de credenciais**, não `NODE_ENV`.

```
REDIS_URL e REDIS_TOKEN presentes  → adapters Redis
ausentes                           → adapters de dev (que lançam em produção)
```

Escolher por credencial em vez de por ambiente dá duas propriedades: dá para
exercitar os adapters reais localmente, e um deploy mal configurado continua
falhando alto em vez de silenciosamente rodar sem defesa.

**A instanciação preguiçosa é inegociável.** Toda a construção acontece dentro de
`buildDeps()`, chamada por `getAnalyzeUrl()`, nunca em tempo de módulo. Foi
verificado em execução que importar `container.ts` sob `NODE_ENV=production` não
constrói nada; quebrar isso quebra `next build`.

### Fluxo de dados de uma requisição autorizada

```
route → clientKey
      → RedisRateLimiter.check      [INCR janela horária]      recusa → 429
      → fetch                        [lookup validador]         recusa → 400
      → extração, segmentação, guarda de índice                 (grátis)
      → classifier.estimateInputTokens                          (countTokens)
      → RedisBudgetGuard.authorize   [INCR pré-cobrança]        recusa → 413/503
      → classifier.classify          ← ÚNICO PONTO QUE GASTA
      → RedisCostRecorder.record     [INCR delta real]          nunca lança
```

### Tratamento de erro e resiliência

**Redis indisponível: falha fechada.** Decisão, com a razão escrita.

Falhar aberto significa servir sem limite exatamente quando não sabemos quanto já
foi gasto. Pior: torna a dependência um **vetor de ataque**. O free tier do
Upstash tem limite de requisições; quem quiser desligar as defesas só precisa
esgotá-lo e esperar o fail-open. A defesa passaria a ser desativável por quem ela
deveria conter.

O custo é real e aceito: durante uma indisponibilidade do Redis, o site responde
503 e não analisa nada. Para uma ferramenta gratuita de portfólio, indisponível é
melhor que uma fatura inesperada.

`GUARD_UNAVAILABLE` é código próprio, e não `BUDGET_EXCEEDED`, porque "não
consegui decidir" e "decidi que não" são coisas diferentes — e a diferença
aparece no log quando alguém for investigar.

**A ordem das guardas é requisito, não detalhe.** Já existe teste que asserta a
sequência inteira; ele precisa continuar passando.

---

## Configuração

| Variável | Antes | Depois | Razão |
|---|---|---|---|
| `DAILY_TOKEN_BUDGET` | 2.000.000 tokens | **removida** | Conta só entrada; a saída é 73% do custo |
| `MAX_TOKENS_PER_REQUEST` | 40.000 tokens | **removida** | Mesmo problema |
| `DAILY_BUDGET_USD` | — | **1.00** | Teto aprovado, na unidade em que foi aprovado |
| `MAX_REQUEST_BUDGET_USD` | — | **0.10** | ~6 análises típicas; recusa outlier sem recusar artigo longo legítimo |
| `MODEL_INPUT_USD_PER_MTOK` | — | **1.00** | Precificação explícita, não embutida em código |
| `MODEL_OUTPUT_USD_PER_MTOK` | — | **5.00** | Idem |
| `BUDGET_OUTPUT_RATIO` | — | **0.70** | Medido 0,53; margem porque subestimar é a falha a evitar |
| `REDIS_URL` / `REDIS_TOKEN` | opcionais | opcionais | Presença seleciona os adapters de produção |

Com `DAILY_BUDGET_USD=1.00` e custo típico de US$ 0,0155, o teto comporta **~64
análises por dia**.

---

## Plano de teste

Tudo aqui tem ramificação, efeito colateral ou dependência externa. Nada se
qualifica para skip.

### O teste que decide a change

**A pinagem tem de ser provada em execução.** Um resolvedor que devolve endereço
público na primeira chamada e `169.254.169.254` na segunda: a requisição precisa
ser recusada. Se a Rota A for adotada e o dispatcher for ignorado, este teste
falha — que é o ponto. Um teste que só verifica que a requisição funciona não
distingue pinagem real de pinagem ignorada.

Complementos: nome resolvendo para conjunto misto público/privado rejeita o
conjunto inteiro; cada salto de redirect passa pela mesma validação; HTTPS para
host público real mantém verificação de certificado (não regride para conexão
insegura).

### Guardas Redis, com `FakeRedisClient` e `FixedClock`

Limite atingido recusa com `retryAfterSeconds` derivado do TTL real; a janela
vira e libera; chaves de clientes distintos não interferem; pré-cobrança impede
que duas autorizações concorrentes furem o teto; recusa devolve o valor
pré-cobrado; reconciliação com custo real menor que o estimado reduz o contador;
`RedisUnavailableError` vira `GUARD_UNAVAILABLE` no limiter e no guard, e vira
log — nunca exceção — no recorder.

### Contrato

Todo `AnalysisErrorCode` tem status mapeado (a união fechada garante em
compilação); `REQUEST_TOO_EXPENSIVE` é 413 e `BUDGET_EXCEEDED` é 503; ambos e
`RATE_LIMITED` emitem `Retry-After`; o teste de ordem das guardas continua verde.

### Container

Com credenciais presentes monta adapters Redis; ausentes, monta os de dev;
importar o módulo sob `NODE_ENV=production` não constrói nada.

---

## Riscos e trade-offs

| Risco | Mitigação |
|---|---|
| **O dispatcher da Rota A não tem efeito sob o Next e falha em silêncio** | O teste de pinagem é o critério de aceite. Rota B documentada como alternativa, com o custo (descompressão manual) declarado |
| **Fail-closed derruba o site em outage do Upstash** | Aceito e declarado. Para ferramenta gratuita, indisponível é melhor que fatura inesperada |
| **Latência: duas idas ao Redis por requisição** | `incrByWithTtl` faz incremento e expiração numa ida. ~50–100ms sobre uma análise de ~10s é ruído |
| **Contador diário deriva se o recorder falhar** | Deriva para MAIS caro (fica a estimativa com margem), que erra para o lado seguro. Chave tem TTL de 48h e o erro não se acumula entre dias |
| **`outputRatio` medido em UMA análise** | Margem de 0,53 para 0,70. Errar para cima recusa análises que caberiam; errar para baixo fura o teto. A assimetria é intencional |
| **Janela fixa permite rajada de 2×** | Declarado. O teto diário continua sendo o limite real de gasto |

## Débito que esta change NÃO resolve

- **"Disclaimer acima da dobra" segue sem teste** — requisito posicional,
  inverificável sem navegador.
- **`clientKeyOf` confia em `x-forwarded-for`.** Na Vercel a borda reescreve o
  cabeçalho, o que torna o risco aceitável em produção; um atacante falando
  direto com o servidor poderia forjá-lo. Endurecer exige saber o número de
  proxies confiáveis à frente. **Fica registrado como item desta change**, na
  fase 3, e não como débito silencioso.
- **A escala do score (ADR-007)** continua sem base empírica. Não bloqueia
  deploy, mas bloqueia divulgação confiante — ver a ressalva no `context-resume`.
