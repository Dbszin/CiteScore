# Spec Delta: Proteção de Custo e Abuso

## Current State

Nada. Repositório vazio.

## Changes

Este delta cobre o risco `high/high` do projeto: **endpoint público, sem login, que gasta dinheiro em LLM a cada requisição.**

A estimativa de [ADR-005](../../../../decisions/005-modelo-llm-e-custo.md) é de ~$0,13 por análise com o modelo default. Mil requisições abusivas custam ~$130. Não existe deploy público responsável sem as três defesas abaixo.

### ADDED

**Defesa 1 — Rate limit por IP**

- Porta `RateLimiter`. `RedisRateLimiter` em produção, `AllowAllRateLimiter` em dev e teste.
- Janela deslizante por IP, configurável por `RATE_LIMIT_PER_HOUR`.
- Roda **antes** do fetch. Requisição bloqueada não gasta nem banda.
- Retorna `Retry-After`.

**Defesa 2 — Caps de conteúdo**

- `MAX_CONTENT_BYTES` — aplicado **durante** o stream de download, não após.
- `MAX_ANALYZABLE_SENTENCES` — teto de sentenças que entram na análise. Acima dele, truncar e sinalizar no relatório; nunca analisar silenciosamente um subconjunto.
- `MAX_SENTENCES_PER_LLM_CALL` — particiona o lote para limitar `max_tokens` por chamada.

**Defesa 3 — Budget guard**

- Porta `BudgetGuard`. Pré-flight com `countTokens` **antes** de gastar.
- Duas recusas distintas: `request_too_expensive` (esta análise sozinha excede o limite) e `daily_cap_reached` (o teto do dia acabou).
- Teto diário em `DAILY_TOKEN_BUDGET`, com contador de TTL diário.
- Retorna `BUDGET_EXCEEDED` com `Retry-After`.

**Observabilidade**

- Porta `CostRecorder` registrando `input_tokens`, `output_tokens`, `cache_creation_input_tokens` e `cache_read_input_tokens` por análise, mais o modelo usado.
- É a fonte do acceptance criteria de M2: **custo real medido, não estimado.**

### Por que Redis, e não memória

Serverless não tem memória compartilhada entre invocações. Um contador em memória de processo é reiniciado a cada cold start e não é visto pelas outras instâncias — ou seja, um rate limit em memória rodando na Vercel **não limita nada** sob carga real. Ele daria a sensação de proteção sem a proteção, que é pior que não ter.

Contador de rate limit não é banco de dados de produto: não guarda conteúdo, não guarda usuário, tem TTL curto. A decisão de "sem banco" do discovery permanece intacta.

**[OQ-2](../../.spec.yaml)** — a dependência de Upstash Redis (free tier) precisa do aval do usuário. Alternativa, se recusada: rate limit na camada de firewall da plataforma de deploy, o que resolve a Defesa 1 mas **não** a Defesa 3 — o budget guard precisa de contador próprio de qualquer forma.

### `countTokens`, nunca `tiktoken`

`tiktoken` é o tokenizador da OpenAI e subestima tokens do Claude em 15–20% em texto comum, mais em conteúdo não inglês. Uma estimativa baixa no budget guard é exatamente a falha que o guard existe para prevenir: ele autorizaria gastos acima do teto acreditando estar dentro dele.

## Migration Notes

Não aplicável — projeto novo.

## Backward Compatibility

Não aplicável — nada existe.

## Acceptance Criteria

- [ ] Nenhum caminho de código chama a Claude API antes de `rateLimiter.check` e `budgetGuard.authorize` — verificado por teste de ordem.
- [ ] Requisição acima do rate limit retorna 429 com `Retry-After` e **não** faz fetch.
- [ ] Página maior que `MAX_CONTENT_BYTES` tem o download interrompido durante o stream.
- [ ] Artigo com mais sentenças que `MAX_ANALYZABLE_SENTENCES` é truncado **e** o relatório sinaliza a truncagem.
- [ ] Teto diário atingido retorna 503 `BUDGET_EXCEEDED`.
- [ ] Análise individual acima do limite por requisição é recusada com motivo `request_too_expensive`.
- [ ] `CostRecorder` grava uso real em toda análise que chamou o LLM.
- [ ] Relatório de calibração de M2 emite custo médio por análise em dólares, a partir de uso real.
- [ ] Testes de janela de tempo do budget guard usam `FixedClock`, não relógio do sistema.
- [ ] **Nenhuma** das três defesas está desabilitada no ambiente de produção — verificado antes do deploy.
