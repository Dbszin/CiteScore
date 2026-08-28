# ADR-003 — A fórmula do CiteScore

- **Data:** 2026-08-27
- **Status:** aceita
- **Contexto do change:** [001-analisador-densidade-factual](../changes/001-analisador-densidade-factual/)

## Contexto

O discovery entregou o requisito "score de densidade factual" sem definir como o número sai da distribuição das três categorias. Essa fórmula não existia. Ela é o produto: define o que o usuário vai tentar otimizar.

Um erro de desenho aqui é caro de duas formas. Se a fórmula punir opinião, ela empurra todo mundo a produzir texto sem voz — e opinião rotulada é legítima em conteúdo editorial. Se a fórmula só recompensar densidade, um texto com muitas afirmações penduradas sem fonte pontua igual a um texto bem sustentado.

## Decisão

Duas sub-métricas, uma fórmula.

Sejam, sobre as **sentenças analisáveis** (`N`):

- `S` = afirmações com dado ou fonte (`SOURCED`)
- `U` = afirmações sem fonte (`UNSOURCED`)
- `O` = opinião (`OPINION`)
- `N = S + U + O`

**Densidade Factual** — quanto do texto é afirmação sustentada:

```
FD = S / N
```

**Taxa de Lacuna** — dentre as afirmações feitas, quantas ficaram penduradas:

```
GAP = U / (S + U)
```

**CiteScore** (0–100, inteiro):

```
CiteScore = round(100 * (0.6 * FD + 0.4 * (1 - GAP)))
```

### Por que esses dois termos

`FD` recompensa produzir afirmação sustentada. `1 - GAP` recompensa **não deixar afirmação pendurada** — é a métrica acionável, e é a única das duas que o usuário consegue mover sem reescrever o artigo inteiro: basta adicionar fonte ao que já afirmou.

Opinião entra apenas **diluindo** `FD`, nunca penalizando diretamente. Um artigo declaradamente editorial pontua baixo em `FD` sem ser tratado como defeituoso — a UI apresenta os dois números separados justamente para que "score baixo porque é opinativo" seja distinguível de "score baixo porque afirma sem sustentar".

Os pesos 0.6 / 0.4 são **um ponto de partida, não um resultado**. São a primeira coisa que a calibração de M2 deve questionar.

### Casos de borda

| Condição | Comportamento |
|---|---|
| `N < 10` sentenças analisáveis | Não emitir score. Retornar `INSUFFICIENT_CONTENT`. Score sobre texto curto é ruído apresentado como medida |
| `S + U == 0` (texto 100% opinião) | `GAP` é indefinido. Não emitir score: retornar `NO_CLAIMS_FOUND` com o breakdown preenchido. Calcular `1 - GAP = 1` daria bônus a um texto sem nenhuma afirmação, que é o oposto do que a métrica significa |
| `U == 0` e `S > 0` | `GAP = 0`, termo vale 1. Correto: nada pendurado |
| Idioma fora de PT-BR/EN | Não emitir score. Retornar `UNSUPPORTED_LANGUAGE` |

Os dois primeiros casos são a razão pela qual a resposta da API precisa modelar "sem score" como estado de primeira classe, e não como `score: 0`. Zero é uma medida; ausência de medida é outra coisa.

### Versionamento

Toda resposta carrega `scoreVersion` (`"1.0.0"` no v1). **Alterar qualquer peso, o limiar de `N` mínimo ou a definição de sentença analisável obriga incrementar a versão.**

Os pesos vivem em um único módulo `src/core/scoring/weights.ts`. Sem essa regra, um ajuste de peso torna silenciosamente incomparáveis dois scores que o usuário vai comparar de qualquer jeito — e ninguém descobre.

## Consequências

**Positivas**

- Fórmula pura e determinística: testável com tabela de entrada/saída, sem mock e sem rede.
- Os dois números separados (`FD` e `GAP`) dão à UI material para explicar *por que* o score é o que é. Um número único não explicaria nada.
- Não penalizar opinião mantém o produto usável em conteúdo editorial.
- Ausência de score é estado explícito, não um zero enganoso.

**Negativas**

- Os pesos são arbitrários até serem calibrados. Qualquer precisão sugerida pelo número é falsa nesse intervalo.
- `FD` e `GAP` são correlacionados: mexer em `S` move os dois termos. A fórmula não é ortogonal, o que dificulta raciocinar sobre o efeito de uma reescrita.
- Um score 0–100 convida o usuário a persegui-lo. Se a classificação estiver ruim, ele vai otimizar em cima de ruído com aparência de precisão.

**Mitigação da última:** a UI é obrigada a exibir o breakdown junto ao score, nunca o número sozinho — requisito registrado em [ADR-004](004-honestidade-como-contrato.md).

## Alternativas rejeitadas

- **`Score = FD` puro.** Simples e explicável, mas trata igualmente um texto com 10 afirmações sustentadas e outro com 10 sustentadas mais 30 penduradas. Perde justamente o sinal acionável.
- **Penalizar opinião como categoria negativa.** Rejeitado por empurrar o usuário a produzir texto sem voz. Opinião rotulada não é defeito.
- **Score ponderado por posição no texto** (afirmações no início valem mais). Interessante como hipótese de citabilidade, mas é especulação sobre especulação: não temos como validar a premissa base, muito menos um refinamento dela.
- **Escala A–F em vez de 0–100.** Menos falsa precisão e honestamente tentador. Rejeitado porque o usuário-alvo (SEO) trabalha com métricas numéricas e compara; uma letra esconde movimento pequeno que o profissional quer ver.
