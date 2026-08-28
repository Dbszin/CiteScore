---
created_at: 2026-08-27
updated_at: 2026-08-27
project_name: citescore
---

# Progress Checklist: CiteScore

Legenda de status: `not started` | `in progress` | `done` | `blocked`
Prioridade: `P0` bloqueador | `P1` esperado na fase atual | `P2` pode ser adiado

## Deliverables

### M1 — Fundação (target 2026-08-29)

| Item | Status | Priority | Notes |
|------|--------|----------|-------|
| Especificações escritas pelo Architect | not started | P0 | Próximo passo imediato. Nada de código antes da spec. |
| Scaffold Next.js + TypeScript | not started | P0 | Framework de UI a definir (provável Tailwind + shadcn/ui) |
| Config de ambiente + acesso Claude API | not started | P0 | Chave via env var, nunca comitada |
| Decisão de provider de deploy | not started | P2 | Vercel é o default para Next.js; Architect confirma |

### M2 — Motor de análise (target 2026-09-05)

| Item | Status | Priority | Notes |
|------|--------|----------|-------|
| Fetch de URL + extração de conteúdo principal | not started | P0 | Remoção de boilerplate. Tratar paywall e JS-heavy como caso conhecido |
| Segmentação em sentenças | not started | P0 | Base para toda classificação |
| Pré-filtro determinístico | not started | P0 | Números, datas, unidades, links de fonte, marcadores de hedging |
| Classificação LLM dos casos ambíguos | not started | P0 | Claude API. Só o que as regras não resolvem |
| Cálculo de score + breakdown | not started | P0 | 3 categorias: com dado/fonte, sem fonte, opinião |
| Validação manual em ~10 artigos reais | not started | P0 | Acceptance criteria de M2. Não pular |
| Medição de custo por análise | not started | P1 | Define a viabilidade do produto gratuito |

### M3 — Relatório / UI (target 2026-09-12)

| Item | Status | Priority | Notes |
|------|--------|----------|-------|
| Design spec do Designer | not started | P0 | Depende das specs do Architect |
| Tela de entrada de URL + estado de loading | not started | P0 | Análise leva segundos; feedback de progresso importa |
| Score + breakdown por categoria | not started | P0 | Métrica principal do produto |
| Highlight inline por sentença | not started | P0 | É o que torna o resultado acionável |
| Sugestões de melhoria por sentença | not started | P1 | Mais chamadas de LLM. Avaliar custo antes de liberar |
| Copy de honestidade do score | not started | P0 | Visível na UI, não escondida em rodapé |

### M4 — Hardening + deploy (target 2026-09-17)

| Item | Status | Priority | Notes |
|------|--------|----------|-------|
| Rate limiting por IP | not started | P0 | Bloqueador de deploy público |
| Cap de tamanho de conteúdo analisado | not started | P0 | Impede análise de páginas gigantes queimando cota |
| Budget guard de gasto com LLM | not started | P0 | Bloqueador de deploy público |
| Tratamento de erro: URL inacessível, paywall, conteúdo vazio | not started | P1 | Mensagem útil em vez de erro genérico |
| Deploy público | not started | P1 | Só depois dos três P0 acima |

### Roadmap pós-v1 (não rastreado como deliverable ativo)

| Item | Status | Priority | Notes |
|------|--------|----------|-------|
| Medição real de citação em motores de AI | not started | P2 | Valida a premissa central do produto. Caro e frágil |
| Análise em lote (sitemap / CSV) | not started | P2 | Exige fila, jobs assíncronos e banco |
| Contas + histórico + evolução do score | not started | P2 | Exige auth e schema |
| Export PDF / white-label | not started | P2 | Demanda de agência, não do usuário v1 |
| Entrada por texto colado e upload de arquivo | not started | P2 | Ampliação de entrada |
