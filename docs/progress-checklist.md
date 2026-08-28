---
created_at: 2026-08-27
updated_at: 2026-08-28
project_name: citescore
---

# Progress Checklist: CiteScore

Legenda de status: `not started` | `in progress` | `done` | `blocked`
Prioridade: `P0` bloqueador | `P1` esperado na fase atual | `P2` pode ser adiado

**Resumo em 2026-08-28:** M1 concluído e verificado. 297 testes passando. Commit `7d69fa7` publicado. **M2 DESBLOQUEADO** ao fim da sessão: a chave da API foi fornecida e o tier do modelo escolhido.

## 🔑 Desbloqueios e decisões de fim de sessão

| Item | Status | Priority | Notes |
|------|--------|----------|-------|
| Fornecer `ANTHROPIC_API_KEY` no ambiente | done | P0 | Presente em `.env.local` (ignorado pelo git) ao fim de 2026-08-28. **Ver alerta de segurança no session-log** |
| OQ-1: decidir tier do modelo | done | P0 | **`claude-haiku-4-5` escolhido** (~US$0,026/análise, 5x mais barato que opus-5). Definido em `.env.local` |
| OQ-2: aprovar dependência de Redis | not started | P1 | Necessária para M4. Rate limit em memória não funciona em serverless |
| **Rotacionar a chave da API** | not started | P0 | Precaução: a chave transitou por arquivo versionado e apareceu em texto plano no transcrito da sessão |

### M1 — Fundação (target 2026-08-29 · **concluído em 2026-08-28, adiantado**)

| Item | Status | Priority | Notes |
|------|--------|----------|-------|
| Especificações escritas pelo Architect | done | P0 | 5 ADRs, proposal, design, 6 spec deltas, tasks |
| Scaffold Next.js + TypeScript | done | P0 | Next 15, TS strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` |
| Config de ambiente + schema Claude API | done | P0 | Schema Zod escrito e testado; o ponto de boot que o invoca chega com o container |
| Regra de lint de pureza do core | done | P0 | Com teste que a **exercita**, não só configurada |
| 6 tipos de domínio + 9 portas | done | P0 | Contratos congelados |
| Decisão de provider de deploy | not started | P2 | Vercel é o default; runtime Node confirmado (Edge não serve — Readability precisa de DOM) |

### M2 — Motor de análise (target 2026-09-05 · **em risco**)

| Item | Status | Priority | Notes |
|------|--------|----------|-------|
| Fetch de URL com defesas de SSRF | done | P0 | Faixas privadas, revalidação após cada redirect, cap durante o stream, deadline total, falha fechada |
| Extração de conteúdo principal | done | P0 | Readability + linkedom, escolhido por medição |
| Decodificação respeitando charset | done | P0 | Site PT-BR em latin-1 gerava mojibake e corrompia os sinais acentuados |
| Guarda de página-índice | done | P0 | Limiar 0,35 na razão de analisáveis, calibrado em 7 páginas reais |
| Segmentação em sentenças | done | P0 | `Intl.Segmenter`, com `analyzable` e `excludedReason` |
| Pré-filtro determinístico PT-BR/EN | done | P0 | Tabelas versionadas + bateria sistemática de 76 casos |
| Cálculo de score + breakdown | done | P0 | Função pura, 4 casos de borda cobertos |
| Guarda de produção nos adapters de dev | done | P1 | Lança se `NODE_ENV=production` — comentário virou garantia |
| Classificação LLM dos casos ambíguos | not started | P0 | **Desbloqueado.** Chave presente, modelo `claude-haiku-4-5` |
| `HybridClassifier` | not started | P0 | Depende do classificador LLM |
| Caso de uso `analyze-url` + container + rota | not started | P0 | Dependem do classificador |
| Validação manual em ~10 artigos reais | not started | P0 | Acceptance criteria do marco. Lista de URLs pronta em `docs/research/` |
| Medição de custo real por análise | not started | P1 | Agora com haiku-4-5: estimativa ~US$0,026/análise, a confirmar |
| Corrigir teste de meta-cobertura inerte | not started | P1 | Provado por injeção que não falha. Era a resposta a 3 bugs consecutivos |
| Criar `.gitattributes` para fixture cp1252 | not started | P2 | `pt-latin1.html` depende de fidelidade de bytes |
| Reduzir escopo do desqualificador de atribuição | not started | P2 | Hoje anula atribuição legítima que coexista com ordinal |

### M3 — Relatório / UI (target 2026-09-12)

| Item | Status | Priority | Notes |
|------|--------|----------|-------|
| Design spec do Designer | not started | P0 | Requisitos que vinculam o Designer já escritos em `specs/.../ui-relatorio/spec.md` |
| Tela de entrada + progresso por estágio | not started | P0 | Análise leva segundos; spinner mudo parece travamento |
| Score + breakdown por categoria | not started | P0 | Score nunca aparece sem o breakdown no mesmo campo visual |
| Highlight inline por sentença | not started | P0 | É o que torna o resultado acionável |
| Sugestões de melhoria por sentença | not started | P1 | Primeiro corte se o prazo apertar |
| Copy de honestidade do score | not started | P0 | Requisito de contrato (ADR-004), não de layout |
| Placeholder de M1 substituído | not started | P1 | `src/app/page.tsx` é placeholder explícito |

### M4 — Hardening + deploy (target 2026-09-17)

| Item | Status | Priority | Notes |
|------|--------|----------|-------|
| **Corrigir TOCTOU / DNS rebinding** | not started | P0 | **Bloqueador de deploy público.** Exige fixar o IP via conector do undici |
| Rate limiting por IP (Redis) | not started | P0 | Bloqueador de deploy público. Depende de OQ-2 |
| Budget guard com teto diário (Redis) | not started | P0 | Bloqueador de deploy público. Depende de OQ-2 |
| Registro de custo real por análise | not started | P1 | Porta `CostRecorder` já definida |
| Truncagem sinalizada no relatório | not started | P1 | Nunca analisar subconjunto em silêncio |
| Deploy público | not started | P1 | Só depois dos quatro P0 acima |
| Smoke test em produção | not started | P1 | ≥3 URLs reais, e verificar as guardas **em produção** |

### Qualidade e processo

| Item | Status | Priority | Notes |
|------|--------|----------|-------|
| Suíte de testes | done | P0 | 297 testes, 282 em clone limpo, `CI=true` falha se fixtures faltarem |
| Duas rodadas de revisão | done | P0 | 2 críticos + 2 altos na primeira, todos corrigidos; PASS na segunda |
| Primeiro commit publicado | done | P0 | `7d69fa7`, 118 arquivos |
| Reconciliar as 21 pendências de débito de spec | not started | P2 | Código e ADRs divergiram por decisão consciente |
| Comitar estes artefatos atualizados | not started | P1 | Docs-as-code — trabalho do Shipper |

### Roadmap pós-v1

| Item | Status | Priority | Notes |
|------|--------|----------|-------|
| Medição real de citação em motores de AI | not started | P2 | Valida a premissa central do produto. Caro e frágil |
| Análise em lote (sitemap / CSV) | not started | P2 | Batch API dá 50% de desconto — é a escolha certa aqui |
| Contas + histórico + evolução do score | not started | P2 | Exige auth e schema |
| Export PDF / white-label | not started | P2 | Demanda de agência, não do usuário v1 |
| Entrada por texto colado e upload | not started | P2 | Ampliação de entrada |
| Reintroduzir "link externo + atribuição" no pré-filtro | not started | P2 | Ramo da ADR-002 removido por não ter produtor; exige offsets de link |
