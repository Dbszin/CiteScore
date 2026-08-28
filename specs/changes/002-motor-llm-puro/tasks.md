# Tasks: motor LLM puro com anotação de sinais

Ordem obrigatória: domínio primeiro, porque é a mudança que o compilador propaga. Tudo que quebrar precisa mudar, e nada silencioso passa.

## 1. Domínio

- [ ] Remover `PrefilterVerdict` de `src/core/domain/classification.ts`
- [ ] Adicionar `SentenceAnnotation` (`sentenceId`, `signals`, `kinds`)
- [ ] Manter `DecidedBy` com os dois valores, documentando que `'rules'` deixa de ser produzido — ver `design.md`
- [ ] Rodar `npx tsc --noEmit` e usar a lista de erros como checklist do que falta

## 2. Pré-filtro: de decisor a anotador

- [ ] Substituir `RulePrefilter.evaluate()` por `annotate()`
- [ ] Adicionar `annotateAll()` devolvendo `ReadonlyMap<SentenceId, SentenceAnnotation>`
- [ ] Remover `strongSource` e o caso `OPINION` direto
- [ ] Manter `matchSignals` **sem alteração**
- [ ] Manter `attribution_disqualifier` como anotação — "parece atribuição mas é ordinal" é informação útil
- [ ] Confirmar que o módulo não importa nada novo

## 3. `AnnotatingClassifier`

- [ ] Criar `src/adapters/classify/annotating-classifier.ts` implementando `ClaimClassifier`
- [ ] Delegar tudo ao classificador interno; anexar `signals` e `kinds` por `sentenceId`
- [ ] **Preservar a verificação de cobertura**: sentença analisável sem classificação → `CLASSIFIER_INVALID_OUTPUT`. Agora vale para todas, não só para as escaladas
- [ ] Deletar `src/adapters/classify/hybrid-classifier.ts`

## 4. Testes

- [ ] **Deletar** `tests/adapters/classify/hybrid-classifier.test.ts`
- [ ] Reescrever `rule-prefilter.test.ts`: os casos de decisão viram casos de anotação. Os textos de exemplo continuam válidos — muda o que se afirma sobre eles
- [ ] Criar `annotating-classifier.test.ts`: anexação correta com **ids esparsos**, cobertura incompleta detectada, propagação de erro do inner
- [ ] **Não desabilitar teste algum.** Teste com `skip` faz a suíte afirmar que algo é verificado quando não é — padrão de falsa confiança já encontrado duas vezes neste projeto
- [ ] `signal-tables.test.ts` **não muda**: testa detecção, não decisão
- [ ] Verificar por busca que nenhum teste ainda espera `decidedBy: 'rules'`

## 5. Scripts

- [ ] `scripts/calibrate.ts`: remover a coluna de taxa de escalonamento e a verificação da meta de 50%
- [ ] `scripts/smoke-classifier.ts`: idem
- [ ] Manter o teto de custo e o aborto por divergência — funcionaram

## 6. Verificação

- [ ] `npx tsc --noEmit`
- [ ] `npx eslint .`
- [ ] `npx vitest run`
- [ ] `npx next build`
- [ ] Busca por `decidedBy: 'rules'` em `src/` retorna apenas a definição do tipo
- [ ] **Execução real** com poucas sentenças confirmando que `signals` vem preenchido. O bug original passou porque os testes usavam dado construído — a verificação precisa ser sobre dado real

## 7. Registro

- [ ] Atualizar o débito de spec de `001-analisador-densidade-factual/tasks.md` apontando para este change
- [ ] Marcar como resolvidos os itens do débito que este change endereça
- [ ] Registrar que a taxa de 100% é **desenho**, não meta a atingir

---

## ⛔ Fora deste change

| Item | Onde vive |
|---|---|
| Alterar pesos do score | Bloqueado por [ADR-007](../../decisions/007-escala-do-score.md) até haver medição |
| Rodar o corpus completo (OQ-3, ~US$ 0,40) | Decisão do usuário |
| `ClaudeSuggestionWriter` | Pendência anterior |
| Anotar sinais na ENTRADA do LLM | Hipótese registrada em `design.md`; exige A/B |
| Redesenhar sinais com NER | Rejeitado na [ADR-006](../../decisions/006-prefiltro-deixa-de-decidir.md) |
| TOCTOU / DNS rebinding | Bloqueador de M4 |
| M3 (UI) | **Bloqueado pela ADR-007** — a escala pode mudar |

## 📌 Para o Designer, quando M3 começar

Dois requisitos que saem deste change:

1. **Os `signals` NÃO explicam a decisão.** O LLM decide sem vê-los. Apresentar como "sinais encontrados no texto", jamais como "motivo da classificação" — seria afirmar uma causalidade que não existe, e colide com a [ADR-004](../../decisions/004-honestidade-como-contrato.md).
2. **A cobertura de sinais é de ~28%.** A maioria das sentenças não terá nenhum. A ausência precisa parecer normal, não defeito.
