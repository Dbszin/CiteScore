# ADR-005 — Modelo, forma de chamada e custo por análise

- **Data:** 2026-08-27
- **Status:** aceita, com [OQ-1](#oq-1--decisão-de-tier-em-aberto) em aberto
- **Contexto do change:** [001-analisador-densidade-factual](../changes/001-analisador-densidade-factual/)

## Contexto

O brief assumiu Claude API sem confirmar modelo. O custo por análise era desconhecido e está registrado como risco que pode inviabilizar o produto gratuito. Esta ADR fixa a forma de chamada, estima o custo com números e isola a decisão de tier como escolha explícita do usuário.

## Decisão

### Modelo

**Default: `claude-opus-5`** — $5,00 por MTok de entrada, $25,00 por MTok de saída, contexto de 1M.

O modelo é fixado em um único ponto (`src/adapters/config/env.ts`), sobrescrevível por variável de ambiente. Trocar de tier não deve exigir tocar em código de classificação.

### Forma de chamada

**Duas chamadas por análise, ambas em lote.** Uma chamada por sentença seria centenas de round-trips.

| Chamada | Entrada | Saída |
|---|---|---|
| 1 — Classificação | Rubrica no `system` (cacheada) + as sentenças escaladas, numeradas | Um veredito por sentença |
| 2 — Sugestões | Instrução no `system` (cacheada) + as sentenças `UNSOURCED` | Uma sugestão de reescrita por sentença |

Parâmetros:

- **Structured output obrigatório** — `client.messages.parse()` com `output_config: { format: zodOutputFormat(schema) }`, usando o helper `zodOutputFormat` de `@anthropic-ai/sdk/helpers/zod`. Parsear JSON de texto livre em produção é fonte de falha evitável.
  `response.parsed_output` **pode ser `null`** quando a validação falha. Tratar como erro de domínio, nunca desreferenciar com `!`.
- **`output_config.effort: "low"`** — classificação é justamente o tipo de carga que não repaga esforço alto, e esforço é cobrado como token de saída.
- **Thinking adaptativo** (default no Opus 5, não precisa ser passado). `budget_tokens` foi **removido** neste modelo e retorna 400 — não existe teto fixo de thinking a configurar.
- **Prompt caching** no bloco `system` de cada chamada, via `cache_control: { type: "ephemeral" }`. A rubrica é o prefixo estável; as sentenças, o conteúdo volátil, vêm depois.
- **Fallback server-side habilitado** — `betas: ["server-side-fallback-2026-07-01"]` com `fallbacks: "default"`. Sem isso, uma recusa do classificador de segurança derruba a análise inteira. Toda resposta precisa checar `stop_reason === "refusal"` **antes** de ler `content`: a recusa chega como HTTP 200, não como exceção.
- **Sem streaming** nas duas chamadas. A UI mostra progresso por etapa do pipeline, não token a token, e `max_tokens` fica dentro do limite seguro para requisição não-streaming.
- **Teto de sentenças por chamada** para limitar `max_tokens`: acima do teto, particionar em chamadas sequenciais. O teto entra em `src/adapters/config/env.ts` junto com os outros caps.

### Medição de custo

`usage` é registrado por análise via porta `CostRecorder`: `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`. **Custo real medido, não estimado** — é o acceptance criteria de M2.

`countTokens` (`client.messages.countTokens`) é usado como pré-flight do budget guard, antes de gastar. **Nunca `tiktoken`** — é o tokenizador da OpenAI e subestima tokens do Claude em 15–20% em texto comum, mais em conteúdo não-inglês. Uma estimativa errada para baixo no budget guard é exatamente a falha que o guard existe para prevenir.

Verificar `usage.cache_read_input_tokens` na calibração: se vier zero em execuções repetidas, há invalidador silencioso no prefixo (timestamp, ID variável, ordem de chave não determinística) e o cache não está funcionando.

## Estimativa de custo

Artigo de referência: ~1.500 palavras, ~80 sentenças analisáveis, 50% escalando ao LLM (a meta de [ADR-002](002-motor-hibrido.md)).

| Componente | Tokens | Custo (`claude-opus-5`, cache quente) |
|---|---|---|
| Entrada não cacheada (sentenças das 2 chamadas) | ~1.700 | ~$0,009 |
| Leitura de cache (rubricas) | ~2.600 | ~$0,001 |
| Saída (vereditos + sugestões + thinking) | ~4.800 | ~$0,120 |
| **Total por análise** | | **~$0,13** |

**A saída domina: ~92% do custo.** Isso reordena as prioridades de otimização de forma pouco intuitiva — prompt caching, que é o primeiro reflexo de quem otimiza custo de LLM, economiza aqui cerca de 10%. Os levers que realmente movem o número são todos do lado da saída:

| Lever | Efeito estimado | Custo |
|---|---|---|
| Não pedir justificativa por sentença na classificação | −35% da saída da chamada 1 | Perde material para explicar a marcação ao usuário |
| Sugestões sob demanda (usuário pede) em vez de todas de uma vez | Remove a chamada 2 do caminho padrão | Fricção de um clique; muda o desenho da UI |
| `effort: low` | Já aplicado no default | — |
| Descer de tier de modelo | Até −80% | Qualidade de classificação a medir |

Aplicando os dois primeiros levers, a análise cai para a faixa de **~$0,05**.

Todos esses números são **projeções aritméticas, não medições**. A distribuição real de tokens de thinking em `effort: low` e a taxa real de escalonamento só serão conhecidas em M2. Tratar como ordem de grandeza para dimensionar o budget guard, não como orçamento.

### <a id="oq-1--decisão-de-tier-em-aberto"></a>OQ-1 — Decisão de tier em aberto

Mesma carga de saída, cache quente:

| Modelo | Entrada / Saída por MTok | Custo estimado por análise | Por 1.000 análises |
|---|---|---|---|
| `claude-opus-5` (default) | $5 / $25 | ~$0,13 | ~$130 |
| `claude-sonnet-5` | $2 / $10 | ~$0,052 | ~$52 |
| `claude-haiku-4-5` | $1 / $5 | ~$0,026 | ~$26 |

**Cerca de 5x entre as pontas.** Para um produto público e gratuito sem login, esse fator é decisão de viabilidade, não de otimização.

A arquitetura **não** decide isso. Descer de tier troca dinheiro por qualidade de classificação, e qualidade de classificação é o ativo do produto — a escolha é do usuário, com os números na mão. O default fica em `claude-opus-5`, o melhor modelo, e a decisão é revisitada em M2 com custo real e qualidade real medidos lado a lado, em vez de projetada agora.

## Consequências

**Positivas**

- Custo por análise deixa de ser desconhecido e passa a ser dimensionável.
- Structured output com validação de schema elimina uma classe inteira de falha de parsing.
- Fallback server-side impede que uma recusa isolada derrube a análise.
- Modelo em ponto único: trocar de tier é mudar uma variável de ambiente.
- A descoberta de que a saída domina o custo redireciona esforço de otimização para onde ele rende.

**Negativas**

- Duas chamadas por análise dobram a exposição a falha de rede e somam latência. Mitigado por retry com backoff no adapter (o SDK já traz `maxRetries` = 2 por padrão).
- `effort: low` pode degradar a classificação de casos ambíguos — que são exatamente os casos escalados ao LLM. Precisa ser testado contra `medium` durante a calibração, não assumido.
- Custo estimado a $0,13 por análise significa que 1.000 análises abusivas custam ~$130. O budget guard não é opcional.

## Alternativas rejeitadas

- **Batch API** (50% de desconto). Rejeitada para o caminho de requisição: é assíncrona e o usuário está esperando o resultado na tela. Fica registrada como a escolha certa para a análise em lote do roadmap.
- **Uma chamada única fazendo classificação e sugestão juntas.** Menos round-trips, mas impede aplicar o lever de sugestões sob demanda e infla `max_tokens` para todos os casos, inclusive os que não precisariam de sugestão.
- **Fast mode.** Disponível em `claude-opus-5` a $10/$50 por MTok. Rejeitado: dobra o custo do componente que já domina a conta, para resolver latência que não é o gargalo — a extração de conteúdo e o round-trip de rede pesam mais na percepção do que a velocidade de geração.
- **Prefill de assistente** para forçar formato de saída. Não é opção: retorna 400 no Opus 5. Structured output é o substituto correto.
