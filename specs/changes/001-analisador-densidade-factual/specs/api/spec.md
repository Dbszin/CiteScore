# Spec Delta: API e Caso de Uso

## Current State

Nada. Repositório vazio.

## Changes

### ADDED

- **`createAnalyzeUrl(deps)`** — caso de uso que orquestra o pipeline. Recebe todas as portas por injeção; não conhece nenhuma implementação.
- **`POST /api/analyze`** — adapter de entrada HTTP. Runtime **`nodejs`**, não Edge: o Readability precisa de implementação de DOM.
- **`container.ts`** — composição das dependências de produção. Único lugar que conhece adapters concretos.
- **`env.ts`** — validação de variáveis de ambiente com Zod na inicialização.
- **Mapa único `AnalysisErrorCode` → status HTTP**, com checagem de exaustividade pelo compilador.
- **`Methodology` obrigatório** em toda resposta bem-sucedida — exigência de [ADR-004](../../../../decisions/004-honestidade-como-contrato.md).
- **Teste de contrato** que falha se `scoreVersion`, `methodology` ou `breakdown` estiverem ausentes do payload.

### Ordem obrigatória do pipeline

O passo 9 do fluxo em `design.md` é a **fronteira do gasto**: rate limit, cap de conteúdo e budget guard rodam antes de qualquer token ser gasto. Reordenar isso — por exemplo, autorizar o budget depois de classificar — anula a proteção sem produzir nenhum erro visível. A ordem é requisito, não detalhe de implementação.

### Contrato

```typescript
// POST /api/analyze
interface AnalyzeRequestBody {
  url: string;
  includeSuggestions?: boolean;  // default true
}

type AnalyzeResponseBody =
  | { ok: true;  analysis: Analysis }
  | { ok: false; error: { code: AnalysisErrorCode; message: string } };
```

`message` é sempre a mensagem destinada ao usuário final, nunca detalhe interno, stack ou texto de exceção de biblioteca.

### Validação de ambiente

Variáveis obrigatórias, validadas no boot:

| Variável | Uso |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API. Somente servidor |
| `ANTHROPIC_MODEL` | Default `claude-opus-5`. Ponto único de troca de tier (OQ-1) |
| `MAX_CONTENT_BYTES` | Cap de download |
| `MAX_ANALYZABLE_SENTENCES` | Cap de sentenças |
| `MAX_SENTENCES_PER_LLM_CALL` | Particionamento do lote |
| `DAILY_TOKEN_BUDGET` | Teto do budget guard |
| `RATE_LIMIT_PER_HOUR` | Janela do rate limit |
| `REDIS_URL` / credenciais | Contadores (M4) — depende de OQ-2 |
| `METHODOLOGY_URL` | Link exigido por ADR-004 |

Falta de variável obrigatória derruba o boot. Descobrir chave ausente por 500 na primeira análise real é falha evitável.

## Migration Notes

Não aplicável — projeto novo.

## Backward Compatibility

Não aplicável — nada existe.

## Acceptance Criteria

- [ ] `analyzeUrl` testado com todas as portas stubadas, sem rede e sem chamada a LLM.
- [ ] Teste que verifica que `budgetGuard.authorize` é chamado **antes** de `classifier.classify` — protege a ordem do pipeline contra regressão.
- [ ] Todo `AnalysisErrorCode` tem status HTTP mapeado; adicionar código novo sem mapear quebra a compilação.
- [ ] `RATE_LIMITED` e `BUDGET_EXCEEDED` retornam `Retry-After`.
- [ ] Teste de contrato falha se `methodology`, `scoreVersion` ou `breakdown` faltarem.
- [ ] Erro inesperado retorna 500 com corpo genérico, sem vazar stack.
- [ ] Boot falha com mensagem clara quando falta variável obrigatória.
- [ ] Nenhuma variável com segredo prefixada `NEXT_PUBLIC_`.
- [ ] `src/core/**` não importa `next`, `@anthropic-ai/sdk`, `@mozilla/readability` nem `linkedom` — verificado por regra de lint.
