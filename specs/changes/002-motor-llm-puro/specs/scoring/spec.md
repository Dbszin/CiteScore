# Spec Delta: Scoring

## Current State

Formula da [ADR-003](../../../../decisions/003-formula-do-score.md), inalterada:

```
CiteScore = round(100 * (0,6 * FD + 0,4 * (1 - GAP)))
```

Calibracao de 2026-08-28 sobre 3 artigos (331 sentencas classificadas):

| Artigo | Tipo esperado | S | U | O | Score |
|---|---|---|---|---|---|
| Ahrefs | MIX | 26 | 60 | 63 | 23 |
| Moz | A-dominante | 19 | 40 | 41 | 24 |
| MDN | B-dominante | 13 | 58 | 11 | 17 |

Agregado: 17,5% SOURCED, 47,7% UNSOURCED, 34,7% OPINION.

## Changes

### NENHUMA mudanca de codigo neste change

**Decisao deliberada.** Ver [ADR-007](../../../../decisions/007-escala-do-score.md).

A calibracao revelou que a escala esta comprimida: tres artigos de perfis
deliberadamente distintos produziram scores numa faixa de 7 pontos, e a
pagina escolhida no golden dataset como "modelo de bom artigo SEO factual"
tirou 24 de 100.

Alterar os pesos com 3 artigos, todos em ingles, repetiria exatamente o erro
que criou o problema: escolher constante sem dado suficiente. Trocar 0,6/0,4
por outro par arbitrario produziria outra escala arbitraria, agora com a
aparencia de ter sido calibrada.

### O que este change ADICIONA ao scoring

- [ ] Nada em `src/core/scoring/`. `weights.ts` intocado, `SCORE_VERSION`
      permanece `1.0.0`.

### O que fica REGISTRADO como pendencia bloqueante de M3

- [ ] **A escala pode mudar.** O Designer precisa saber antes de desenhar a
      apresentacao do score. Desenhar um medidor de 0 a 100 sobre uma regua
      que talvez vire percentil ou faixa nomeada e retrabalho garantido.
- [ ] **Rodar o corpus completo** (11 artigos, PT-BR e EN, ~US$ 0,40) para
      estabelecer a distribuicao observada por tipo de conteudo. E o OQ-3.
- [ ] **Verificar ORDENACAO antes de amplitude.** A pergunta que decide a
      formula nao e se o numero e alto, e sim se artigo denso em fonte pontua
      ACIMA de artigo raso. Ordenacao correta com escala comprimida e
      problema de apresentacao; ordenacao errada e problema de formula, e
      muito mais grave.
- [ ] **Conferir manualmente** o CSV ja gerado (331 sentencas), para separar
      erro de classificacao de caracteristica do texto. Sem isso nao da para
      saber se o score baixo reflete o texto ou o classificador.

## Migration Notes

Nao aplicavel — nenhuma mudanca.

## Backward Compatibility

`SCORE_VERSION` inalterado em `1.0.0`. Scores produzidos antes e depois deste
change sao comparaveis entre si.

## Acceptance Criteria

- [ ] `git diff` sobre `src/core/scoring/` vazio ao fim do change.
- [ ] `SCORE_VERSION` continua `1.0.0`.
- [ ] O bloqueio de M3 esta registrado onde o Designer vai ler.
