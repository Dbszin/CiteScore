# Spec Delta: Classificação

## Current State

Motor híbrido conforme [ADR-002](../../../../decisions/002-motor-hibrido.md): `RulePrefilter` emite veredito (`decided` ou `escalate`), e `HybridClassifier` roteia entre regra e LLM.

Medido em 2026-08-28 sobre 2.149 sentenças reais: o pré-filtro decide **0,3%**, e a taxa de escalonamento é de **100%**. O roteamento existe mas nunca roteia.

## Changes

### REMOVED

- **`PrefilterVerdict`** (`core/domain/classification.ts`) — nada mais emite veredito por regra.
- **`RulePrefilter.evaluate()`** — substituído por `annotate()`.
- **`strongSource`** e o caso **`OPINION` direto** em `rule-prefilter.ts` — as duas regras de decisão.
- **`HybridClassifier`** e seu arquivo de teste — substituídos.
- **`HybridClassifier.escalationRate()`** — sem escalonamento, a métrica perde referente.
- **A meta de ≤50%** — media uma economia inexistente.

### ADDED

- **`SentenceAnnotation`** (`core/domain/classification.ts`) — sinais e kinds por sentença, sem veredito.
- **`RulePrefilter.annotate()`** e **`annotateAll()`** — puras e determinísticas.
- **`AnnotatingClassifier`** — Decorator que delega ao LLM e anexa os sinais.

### MODIFIED

- **`Classification.signals`** passa a vir preenchido para toda sentença com sinal detectado. Hoje está vazio em 100% das classificações reais, porque só a decisão por regra o populava — e ela não ocorre.
- **Verificação de cobertura** passa a valer para todas as analisáveis, não só as escaladas.
- **`scripts/calibrate.ts`** e **`smoke-classifier.ts`** deixam de reportar taxa de escalonamento.

### PRESERVED — e por quê

- **As tabelas de sinais** (`signals/pt-br.ts`, `signals/en.ts`) inteiras. São a única fonte gratuita de explicabilidade.
- **`matchSignals`** — inalterada.
- **A bateria de 76 casos** (`signal-tables.test.ts`) — continua válida: ela testa detecção, não decisão. Foi criada depois de três bugs de regex e segue sendo a proteção contra o quarto.
- **`attribution_disqualifier`** — segue anotando. *"Isto parece atribuição mas é o ordinal 'Segundo Trimestre'"* é informação útil ao leitor, mesmo sem decidir nada.
- **`decidedBy`** — mantido; ver `design.md`.

## Migration Notes

Mudança de contrato interno. Não há consumidor externo: a rota HTTP e o caso de uso ainda não existem. A porta `ClaimClassifier` não muda, então o domínio não é afetado.

## Backward Compatibility

Sem impacto externo. `SCORE_VERSION` **não muda** — a fórmula é intocada, e a distribuição de categorias não se altera, já que o LLM já decidia tudo.

## Acceptance Criteria

- [ ] Nenhum caminho do código produz `decidedBy: 'rules'` — verificado por busca, não por teste de amostra.
- [ ] `RulePrefilter` não tem mais retorno de categoria; a assinatura devolve `SentenceAnnotation`.
- [ ] `AnnotatingClassifier` anexa `signals` corretamente por `sentenceId`, inclusive com ids esparsos.
- [ ] Sentença analisável que volta sem classificação continua produzindo `CLASSIFIER_INVALID_OUTPUT`.
- [ ] Em execução real, `Classification.signals` vem preenchido para ~28% das sentenças — a taxa de detecção medida. **Verificado em execução, não em teste com dado construído**, que é como o problema original passou despercebido.
- [ ] Os testes de decisão por regra foram **deletados**, não desabilitados.
- [ ] A bateria de sinais segue passando sem alteração.
- [ ] O invariante `UNSOURCED` nunca por regra continua verdadeiro — agora trivialmente.
