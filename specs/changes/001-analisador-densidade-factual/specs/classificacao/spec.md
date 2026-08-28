# Spec Delta: Segmentação e Classificação

## Current State

Nada. Repositório vazio.

## Changes

### ADDED

**Segmentação**

- **Porta `SentenceSegmenter`** e **`IntlSentenceSegmenter`** usando `Intl.Segmenter` com `granularity: 'sentence'` — nativo do runtime, zero dependência.
- **Marcação de sentença analisável.** Não entram em `N` nem recebem classificação: heading, item de lista curto, legenda, e fragmento sem verbo. Cada exclusão registra `excludedReason`, para que a UI possa explicar por que uma linha não foi avaliada.
- **Offsets `start` / `end`** por sentença, para o highlight inline reconstruir a posição no texto original.

**Classificação**

- **Porta `ClaimClassifier`** com as três categorias `SOURCED`, `UNSOURCED`, `OPINION`.
- **`RulePrefilter`** — classificação determinística conforme os sinais de [ADR-002](../../../../decisions/002-motor-hibrido.md).
- **Tabelas de sinais** em `signals/pt-br.ts` e `signals/en.ts`, como dados versionados. Ajustar calibração é editar tabela, não caçar regex pelo código.
- **`ClaudeClassifier`** — lote único via `messages.parse()` com `zodOutputFormat`, `effort: "low"`, prompt caching no `system`, fallback server-side habilitado.
- **`HybridClassifier`** — compõe os dois sob a mesma porta. É o único componente que sabe que a classificação é híbrida.
- **Porta `SuggestionWriter`** e **`ClaudeSuggestionWriter`** — sugestões de reescrita para as sentenças `UNSOURCED`. Falha aqui degrada, não derruba.
- **`decidedBy` e `confidence`** em toda classificação. Sem eles a calibração de M2 é impossível.

### Regras invioláveis

1. **`UNSOURCED` nunca é decidido por regra.** É a categoria acionável — a que o usuário vai ler e agir. Errar nela por heurística produz erro confiante que não passa por revisão.
2. **O pré-filtro decide sozinho apenas nos dois casos de alta confiança** definidos na ADR-002. Todo o resto escala.
3. **Nenhum tipo do SDK Anthropic atravessa a fronteira de `src/core/`.** O adapter traduz para tipo de domínio.
4. **`parsed_output` é verificado contra `null`** antes de qualquer uso. Nunca `!`.
5. **`stop_reason === 'refusal'` é checado antes de ler `content`** — a recusa chega como HTTP 200, não como exceção.

## Migration Notes

Não aplicável — projeto novo.

## Backward Compatibility

Não aplicável — nada existe.

## Acceptance Criteria

- [ ] Segmentação correta em texto PT-BR com abreviação (`Dr.`, `etc.`, `p. ex.`), número decimal (`3,14`) e reticências — casos em que quebra naive por ponto falha.
- [ ] Heading, item de lista curto e legenda marcados como não analisáveis, com `excludedReason` preenchido.
- [ ] Pré-filtro classifica direto `"Segundo o IBGE, a inflação fechou 2024 em 4,8%."` como `SOURCED` sem chamar o LLM.
- [ ] Pré-filtro classifica direto `"Na minha opinião, essa é a melhor abordagem."` como `OPINION` sem chamar o LLM.
- [ ] Pré-filtro **escala** `"Estudos mostram que a maioria das empresas já adotou a prática."` — falsa autoridade não é decidida por regra.
- [ ] Nenhuma sentença recebe `UNSOURCED` com `decidedBy: 'rules'` — verificado por teste sobre todo o corpus.
- [ ] Taxa de escalonamento ao LLM medida sobre o corpus e ≤50%.
- [ ] `usage` retornado e agregado por análise.
- [ ] Recusa do modelo produz `CLASSIFIER_REFUSED`, não exceção não tratada.
- [ ] `parsed_output` nulo produz `CLASSIFIER_INVALID_OUTPUT`.
- [ ] Falha do `SuggestionWriter` resulta em `suggestionsDegraded: true` com o resto do relatório íntegro.
