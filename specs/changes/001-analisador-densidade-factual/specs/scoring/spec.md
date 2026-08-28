# Spec Delta: Scoring

## Current State

Nada. A fórmula não existia antes deste change — foi definida em [ADR-003](../../../../decisions/003-formula-do-score.md).

## Changes

### ADDED

- **`weights.ts`** — ponto único de `SCORE_VERSION`, `WEIGHTS` e `MIN_ANALYZABLE_SENTENCES`.
- **`computeScore`** — função pura que recebe as classificações e a contagem de analisáveis e devolve `{ outcome, breakdown }`.
- **`ScoreOutcome` como união discriminada** — `scored` com número, ou `unscored` com motivo. Ausência de score é estado de primeira classe, não `score: 0`.
- **`ScoreBreakdown`** com `factualDensity`, `gapRate` e `llmEscalationRate`.

### Fórmula

```
FD  = sourced / N
GAP = unsourced / (sourced + unsourced)

CiteScore = round(100 * (0.6 * FD + 0.4 * (1 - GAP)))
```

### Regra de versionamento

**Alterar qualquer peso, o limiar de `N` mínimo ou a definição de sentença analisável obriga incrementar `SCORE_VERSION`.** Sem isso, um ajuste de calibração torna silenciosamente incomparáveis dois scores que o usuário vai comparar de qualquer jeito.

### Casos de borda

| Condição | `outcome` |
|---|---|
| `N < 10` | `unscored` / `INSUFFICIENT_CONTENT` |
| `sourced + unsourced === 0` | `unscored` / `NO_CLAIMS_FOUND` |
| `unsourced === 0` e `sourced > 0` | `scored`, `gapRate = 0` |

O segundo caso merece atenção: calcular `1 - GAP = 1` num texto sem nenhuma afirmação daria bônus máximo justamente a quem não afirmou nada. É o oposto do que a métrica significa, e é por isso que ele não recebe score.

## Migration Notes

Não aplicável — projeto novo.

## Backward Compatibility

`SCORE_VERSION` começa em `1.0.0`. Scores só são comparáveis entre si dentro da mesma versão.

## Acceptance Criteria

- [ ] `computeScore` é função pura: sem I/O, sem relógio, sem aleatoriedade. Verificável por inspeção de imports.
- [ ] Testada por tabela de entrada/saída cobrindo os três casos de borda mais os casos normais.
- [ ] `N = 0` não lança exceção nem divide por zero.
- [ ] `sourced + unsourced = 0` retorna `NO_CLAIMS_FOUND`, nunca um score.
- [ ] `N = 9` retorna `INSUFFICIENT_CONTENT`; `N = 10` retorna score.
- [ ] Texto todo sustentado (`unsourced = 0`) pontua estritamente acima do mesmo texto com metade das afirmações sem fonte.
- [ ] Texto majoritariamente opinativo mas com todas as afirmações sustentadas **não** é penalizado pelo termo `GAP` — opinião dilui `FD`, não penaliza.
- [ ] `SCORE_VERSION` presente em toda resposta.
- [ ] Nenhum peso literal aparece fora de `weights.ts` — verificado por busca.
