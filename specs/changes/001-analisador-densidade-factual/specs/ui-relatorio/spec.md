# Spec Delta: UI do Relatório

## Current State

Nada. Repositório vazio.

> **Escopo desta spec:** define os **requisitos e restrições** da UI. A direção visual — paleta, tipografia, hierarquia, composição, motion — é do **Designer**. Este documento diz o que a tela precisa garantir, não como ela deve parecer.

## Changes

### ADDED

- **`URLForm`** — entrada de URL com validação no cliente e estado de submissão.
- **Indicador de progresso por estágio** — `validating → fetching → extracting → classifying → done`. A análise leva segundos; spinner mudo em operação de 10s parece travamento.
- **`ScorePanel`** — o score e, obrigatoriamente, o breakdown no mesmo campo visual.
- **`BreakdownChart`** — distribuição das três categorias.
- **`InlineHighlight`** — o texto extraído com cada sentença colorida por classificação. É o componente que torna o resultado acionável.
- **`SuggestionList`** — sugestões de reescrita para as sentenças `UNSOURCED`.
- **`MethodologyNotice`** — a ressalva exigida por [ADR-004](../../../../decisions/004-honestidade-como-contrato.md).
- **`/metodologia`** — página explicando os sinais, a fórmula e o que **não** foi medido.
- **Estados vazios e de erro** para cada `AnalysisErrorCode`, com a mensagem acionável da tabela em `design.md`.

### Requisitos que vinculam o Designer

De [ADR-004](../../../../decisions/004-honestidade-como-contrato.md):

1. **A métrica primária se chama "Densidade Factual".** "Estimativa de citabilidade" é leitura secundária e nunca aparece sem qualificador. A palavra "citabilidade" nunca é o rótulo isolado do número.
2. **O score nunca é renderizado sem o breakdown no mesmo campo visual.** Número sozinho vira métrica de autoridade.
3. **O disclaimer é conteúdo, não rodapé.** Na região do resultado, legível sem scroll, no mesmo nível hierárquico do score.
4. **A metodologia é acessível a um clique** a partir do resultado.

De `design.md`:

5. **Estado `unscored` tem tratamento visual próprio.** `INSUFFICIENT_CONTENT` e `NO_CLAIMS_FOUND` não são erro nem score zero — são "não há medida a dar", e precisam ler como tal.
6. **`suggestionsDegraded: true` é comunicado.** O usuário vê score e highlight, e é avisado de que as sugestões falharam. Omitir isso silenciosamente faz o produto parecer incompleto sem explicar por quê.
7. **Sentença não analisável é visualmente distinta** de sentença analisada. Heading sem cor de categoria não deve parecer sentença sem classificação.
8. **Segurança:** o texto extraído é conteúdo de terceiros. Renderizar como texto, **nunca** `dangerouslySetInnerHTML`. Este é o vetor de XSS do produto.

### Restrições técnicas

- **Sem biblioteca de estado global.** Uma requisição, um resultado, nenhum cache a coordenar. Estado local na página, conforme `design.md` § State Management.
- **Framework de UI:** Tailwind + shadcn/ui é a recomendação; a escolha final é do Designer. Qualquer opção precisa suportar dark mode e respeitar `prefers-reduced-motion`.
- **Highlight de centenas de sentenças** é o único ponto com risco real de custo de render. Renderizar por trecho, não por caractere. Virtualizar apenas se a medição mostrar necessidade — não antes.

### Primeiro corte se o prazo apertar

Se M3 precisar encolher, a ordem de corte é: **sugestões por sentença** primeiro (é a parte mais cara em LLM e a mais fácil de adiar), depois a página `/metodologia` como página dedicada — mas **nunca** o `MethodologyNotice`, que é requisito de contrato, e nunca o breakdown junto ao score.

## Migration Notes

Não aplicável — projeto novo.

## Backward Compatibility

Não aplicável — nada existe.

## Acceptance Criteria

- [ ] URL de artigo real entra e o relatório renderiza: score, breakdown, highlight inline e sugestões.
- [ ] O score nunca aparece sem o breakdown no mesmo campo visual.
- [ ] `MethodologyNotice` visível sem scroll na região do resultado.
- [ ] A palavra "citabilidade" não aparece como rótulo isolado do número em nenhuma tela.
- [ ] Progresso por estágio visível durante a análise.
- [ ] Cada `AnalysisErrorCode` tem estado de erro próprio com a mensagem acionável correspondente.
- [ ] `unscored` renderiza diferente de score baixo e diferente de erro.
- [ ] `suggestionsDegraded` é comunicado ao usuário.
- [ ] Nenhum uso de `dangerouslySetInnerHTML` — verificado por busca e por regra de lint.
- [ ] Sentença não analisável é visualmente distinguível de sentença classificada.
- [ ] Navegação por teclado funcional e `prefers-reduced-motion` respeitado.
