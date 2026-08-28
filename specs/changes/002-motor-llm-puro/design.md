# Design: motor LLM puro com anotação de sinais

## Overview

Uma inversão de responsabilidade, não uma reescrita. O `RulePrefilter` deixa de emitir veredito e passa a emitir **anotação**; o classificador composto deixa de rotear e passa a **enriquecer**.

```
antes:  Sentença → prefilter DECIDE ─── ou escala ──→ LLM decide
depois: Sentença → prefilter ANOTA sinais ──→ LLM decide ──→ anotação anexada
```

O ganho está no que sai: `Classification.signals`, hoje vazio em 100% das classificações reais, passa a carregar os sinais encontrados — a única fonte gratuita de explicabilidade, já que a justificativa por sentença foi cortada por custo na [ADR-005](../../decisions/005-modelo-llm-e-custo.md).

---

## Proposed Directory & File Structure

```
citescore/
├── src/
│   ├── adapters/classify/
│   │   ├── rule-prefilter.ts              (Modified) evaluate → annotate
│   │   ├── hybrid-classifier.ts           (Removed)  substituído
│   │   ├── annotating-classifier.ts       (New)      anota + delega
│   │   ├── claude-classifier.ts           (Unchanged)
│   │   ├── model-capabilities.ts          (Unchanged)
│   │   ├── schemas.ts                     (Unchanged)
│   │   └── signals/                       (Unchanged) tabelas preservadas
│   └── core/domain/
│       └── classification.ts              (Modified) PrefilterVerdict removido
│
├── tests/adapters/classify/
│   ├── rule-prefilter.test.ts             (Modified) decisão → anotação
│   ├── hybrid-classifier.test.ts          (Removed)
│   ├── annotating-classifier.test.ts      (New)
│   ├── signal-tables.test.ts              (Unchanged) a bateria continua válida
│   └── claude-classifier.test.ts          (Unchanged)
│
└── scripts/
    ├── calibrate.ts                       (Modified) remove taxa de escalonamento
    └── smoke-classifier.ts                (Modified) idem
```

Nenhum arquivo em `src/core/ports/` muda. É o teste de que a arquitetura da [ADR-001](../../decisions/001-arquitetura-hexagonal.md) fez seu trabalho: uma mudança que inverte a responsabilidade central do motor não atravessa a fronteira do domínio.

---

## Code Architecture & Design Patterns

### [Padrões Aplicados]

| Padrão | Onde | Justificativa |
|---|---|---|
| **Decorator** | `AnnotatingClassifier` | Envolve um `ClaimClassifier` e enriquece o resultado sem alterar a decisão. É a forma correta do que o `HybridClassifier` tentava ser: ele mudava o comportamento (roteava); este só acrescenta informação |
| **Strategy (preservado)** | `ClaimClassifier` continua a porta | O caso de uso segue sem saber quem classifica. Trocar LLM puro por qualquer outra estratégia continua sendo substituir um adapter |
| **Separation of Concerns** | Detecção de sinais ≠ decisão de categoria | A confusão entre as duas é a origem do problema: sinais são evidência textual, categoria é julgamento. Regex faz o primeiro, não o segundo |
| **Fail-safe default** | Ausência de sinal não implica nada | Antes, ausência de sinal roteava para o LLM; agora simplesmente não anota. Nenhuma decisão depende de ausência |

### Padrão explicitamente **abandonado**

**Composite decisório.** O `HybridClassifier` compunha dois `ClaimClassifier` sob a mesma interface, e o valor disso era a intercambiabilidade. Com um dos dois resolvendo 0,3%, a composição virou indireção sem contrapartida. Fica registrado que o padrão estava correto e a premissa é que era falsa — se um dia houver um classificador barato competente, o Composite volta.

### [Estratégia de Implementação]

1. **Domínio primeiro.** Remover `PrefilterVerdict` e introduzir `SentenceAnnotation`. É a mudança que o compilador propaga: tudo que quebrar precisa mudar, e nada silencioso passa.
2. **`RulePrefilter.annotate`.** A lógica de `matchSignals` já existe e não muda. O que sai é `strongSource`, o caso `OPINION` direto e o uso do desqualificador para decidir — o desqualificador continua **anotando**, porque "isto parece atribuição mas é ordinal" é informação útil ao leitor.
3. **`AnnotatingClassifier` substitui `HybridClassifier`.** Delega tudo ao LLM e anexa os sinais por `sentenceId`. Sem roteamento, sem `escalationRate`, sem detecção de omissão por escalonamento — mas **preservando** a verificação de cobertura: sentença analisável sem classificação continua sendo erro.
4. **Testes: deletar, não desabilitar.** Os testes de decisão por regra testam comportamento que deixou de existir. Mantê-los com `skip` deixaria a suíte afirmando que algo é verificado quando não é — o mesmo padrão de falsa confiança já encontrado duas vezes neste projeto.
5. **Scripts por último**, quando o contrato estiver estável.

**Fluxo de dados:** unidirecional. `Sentence[]` → anotação (local, gratuita) → LLM (rede, paga) → `Classification[]` com `signals` preenchidos. Nenhum estado compartilhado.

**Tratamento de erro:** inalterado. Falha de classificação continua fatal; a anotação não pode falhar porque é regex local sobre string.

**Resiliência:** a anotação é pura e determinística. Se a tabela de sinais tiver um bug, o efeito é uma explicação errada na UI — não uma classificação errada. **Essa é a mudança de risco mais importante do change:** um bug de regex deixa de poder alterar o score.

---

## Data Model

```typescript
// ─── src/core/domain/classification.ts ─────────────────────────────────

/** REMOVIDO: PrefilterVerdict — nada mais emite veredito por regra. */

/**
 * Sinais encontrados numa sentença pela análise determinística.
 *
 * NÃO é uma decisão e não deve ser apresentada como o motivo da
 * classificação: o LLM decide sozinho, sem ver esta anotação (ver "Hipótese
 * não implementada" abaixo). São evidências textuais que ajudam o leitor a
 * entender o texto, não a auditar o modelo.
 */
export interface SentenceAnnotation {
  readonly sentenceId: SentenceId;
  readonly signals: readonly SignalName[];
  /** Agrupamento por tipo, para a UI destacar falsa autoridade sem reparsear. */
  readonly kinds: readonly SignalKind[];
}

/**
 * `decidedBy` é mantido. Na prática vale sempre `'llm'` a partir deste
 * change, mas removê-lo seria mudança de contrato sem ganho, e o campo volta
 * a discriminar se um classificador determinístico competente aparecer.
 */
export type DecidedBy = 'rules' | 'llm';
```

## API Contracts

```typescript
// ─── src/adapters/classify/rule-prefilter.ts ───────────────────────────

export class RulePrefilter {
  /**
   * SUBSTITUI `evaluate`. Detecta sinais; não decide categoria.
   * Pura, sem I/O, determinística.
   */
  annotate(
    sentence: Sentence,
    content: ExtractedContent,
  ): SentenceAnnotation;

  /** Conveniência para o lote inteiro, indexada por `sentenceId`. */
  annotateAll(
    sentences: readonly Sentence[],
    content: ExtractedContent,
  ): ReadonlyMap<SentenceId, SentenceAnnotation>;
}

// ─── src/adapters/classify/annotating-classifier.ts ────────────────────

/**
 * Decorator: delega a classificação e enriquece o resultado com os sinais.
 * Substitui `HybridClassifier`.
 */
export class AnnotatingClassifier implements ClaimClassifier {
  constructor(
    private readonly inner: ClaimClassifier,
    private readonly prefilter?: RulePrefilter,
  );

  /**
   * @throws AnalysisError CLASSIFIER_* (propagados de `inner`)
   * @throws AnalysisError CLASSIFIER_INVALID_OUTPUT quando alguma sentença
   *   analisável volta sem classificação — a verificação de cobertura é
   *   preservada do `HybridClassifier`
   */
  classify(
    sentences: readonly Sentence[],
    content: ExtractedContent,
  ): Promise<ClassificationResult>;
}

/** REMOVIDO: HybridClassifier.escalationRate() — não há mais escalonamento. */
```

## Flow Diagrams

### Classificação

```
1. Recebe sentenças; filtra analisáveis
2. prefilter.annotateAll(...)          [local, grátis, determinístico]
3. inner.classify(...)                 [rede, pago — TODAS as analisáveis]
4. Para cada Classification: anexa signals e kinds da anotação
5. Verifica cobertura: analisável sem classificação → CLASSIFIER_INVALID_OUTPUT
6. Devolve ClassificationResult
```

O passo 2 é gratuito e pode rodar antes ou depois do 3 sem alterar o resultado. Roda antes por clareza de leitura.

### Hipótese NÃO implementada, registrada para não se perder

Anotar os sinais **na entrada** do LLM — *"esta sentença contém: falsa autoridade"* — poderia melhorar a precisão a custo baixo, já que entrada custa 1/5 da saída no haiku.

**Não é implementado aqui**, por dois motivos: exigiria medição A/B para saber se ajuda ou enviesa, e enviesar o modelo com a saída de um detector que erra é um risco real. Fica como experimento para depois da linha de base da [ADR-007](../../decisions/007-escala-do-score.md).

## State Management

Sem estado. A anotação é uma função pura de `(Sentence, ExtractedContent)`; o classificador é sem estado entre chamadas.

## Error Handling

Inalterado. Um caminho de erro **desaparece**: `HybridClassifier` lançava `CLASSIFIER_INVALID_OUTPUT` quando o LLM omitia uma sentença **escalada**. Como agora todas são enviadas, a verificação passa a ser sobre todas as analisáveis — mais abrangente, mesmo código de erro.

## Performance Considerations

| | Antes | Depois |
|---|---|---|
| Chamadas ao LLM | 100% das analisáveis (medido) | 100% das analisáveis |
| Custo por artigo | US$ 0,05 (medido) | US$ 0,05 |
| Trabalho local | prefilter 2x quando `escalationRate` era chamado | prefilter 1x |

**O custo não muda**, porque o comportamento observado já era LLM puro. O que muda é o código deixar de prometer uma economia que não acontece.

## Security Considerations

Sem alteração de superfície. Um ganho indireto: a anotação não pode mais alterar classificação, então um erro na tabela de sinais deixa de ser capaz de mover o score — vira apenas uma explicação imprecisa na UI.
