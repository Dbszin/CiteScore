---
created_at: 2026-08-27
updated_at: 2026-08-28
project_name: citescore
---

# Progress Checklist: CiteScore

Legenda de status: `not started` | `in progress` | `done` | `blocked`
Prioridade: `P0` bloqueador | `P1` esperado na fase atual | `P2` pode ser adiado

**Resumo em 2026-08-28 (fim da sessão):** M1 e M2 concluídos. **O motor virou
aplicação:** rota HTTP, caso de uso, container e tela funcional, verificados em
uso real. **401 testes, 6 commits, versão 0.4.0.** M3 segue bloqueado pela
ADR-007 — a tela que existe é provisória e deliberadamente sem decisão de
design. **M4 é o que separa o projeto do deploy**, com três bloqueadores.

## 🔑 Desbloqueios e decisões pendentes

| Item | Status | Priority | Notes |
|------|--------|----------|-------|
| **Rotacionar a chave da API** | not started | P0 | **Só o usuário pode.** A chave transitou por arquivo versionado de repo público. Nenhum commit publicado a contém — verificado — mas a rotação fecha o incidente |
| Fornecer `ANTHROPIC_API_KEY` | done | P0 | Em `.env.local`, ignorado pelo git |
| OQ-1: tier do modelo | done | P0 | `claude-haiku-4-5`. **Custo real US$ 0,0155/artigo** |
| OQ-2: aprovar dependência de Redis | done | P1 | **Upstash free tier aprovado.** Ainda não implementado |
| Teto de gasto diário | done | P1 | **US$ 1/dia**, aprovado. Comporta ~65 análises |
| **OQ-3: rodar o corpus completo** | not started | P0 | 11 artigos, ~US$ 0,40. Dá base à ADR-007 e **destrava M3** |

### M1 — Fundação (**concluído em 2026-08-28**)

| Item | Status | Priority | Notes |
|------|--------|----------|-------|
| Especificações escritas pelo Architect | done | P0 | 7 ADRs, proposal, design, 6 spec deltas, tasks |
| Scaffold Next.js + TypeScript | done | P0 | Next 15, TS strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` |
| Config de ambiente + schema Claude API | done | P0 | Schema Zod, invocado pelo container |
| Regra de lint de pureza do core | done | P0 | Com teste que a **exercita** |
| 6 tipos de domínio + 9 portas | done | P0 | Contratos congelados; 3 extensões aditivas registradas como débito |
| Decisão de provider de deploy | done | P2 | **Vercel**, runtime Node confirmado |
| Placeholder de M1 substituído | done | P1 | `src/app/page.tsx` é a tela real agora |

### M2 — Motor de análise (**concluído em 2026-08-28**)

| Item | Status | Priority | Notes |
|------|--------|----------|-------|
| Fetch de URL com defesas de SSRF | done | P0 | Verificado em produção local: `169.254.169.254` → 400 |
| Extração de conteúdo principal | done | P0 | Readability + linkedom, escolhido por medição |
| Decodificação respeitando charset | done | P0 | Corrigia mojibake em site PT-BR latin-1 |
| Guarda de página-índice | done | P0 | Verificada em real: home da Folha → 422 |
| Segmentação em sentenças | done | P0 | `Intl.Segmenter`, com `analyzable` e `excludedReason` |
| Pré-filtro determinístico PT-BR/EN | done | P0 | **Resolve 0,3% na prática** — ver ADR-006 |
| Cálculo de score + breakdown | done | P0 | Função pura, invariante de consistência incluída |
| Classificação LLM (`ClaudeClassifier`) | done | P0 | Structured output via `output_format` |
| `HybridClassifier` | done | P0 | **Será substituído** pelo `AnnotatingClassifier` no change 002 |
| **Caso de uso `analyze-url`** | done | P0 | Ordem das guardas com teste que asserta a sequência inteira |
| **`container.ts`** | done | P0 | Instanciação **preguiçosa** — `next build` roda com `NODE_ENV=production` |
| **`POST /api/analyze`** | done | P0 | Runtime `nodejs`, mapa exaustivo de status HTTP |
| Ferramenta de calibração | done | P0 | Teto de custo funcionou em execução |
| Medição de custo real | done | P1 | **US$ 0,0155/artigo** pela rota — 3x abaixo da calibração |
| **Validação manual do CSV (331 sentenças)** | not started | P1 | Os dados existem; falta o julgamento humano |

### M3 — Relatório / UI (target 2026-09-12)

> ⛔ **O MARCO SEGUE BLOQUEADO pela [ADR-007](../specs/decisions/007-escala-do-score.md).**
> Existe uma tela funcional, construída de propósito como **provisória** e sem
> nenhuma decisão de design sobre a escala do score. O que ela cumpre são os
> requisitos de **contrato** da ADR-004, que independem de direção visual.
> O M3 propriamente dito — Designer, design system, apresentação final —
> destrava com a OQ-3.

| Item | Status | Priority | Notes |
|------|--------|----------|-------|
| Tela de entrada + progresso | done | P0 | Cronômetro real e lista de estágios; nada de progresso simulado |
| Score + breakdown por categoria | done | P0 | **Garantido pelo TIPO** em `report-model.ts`, não por condicionais |
| Highlight inline por sentença | done | P0 | Bug de especificidade de CSS corrigido; travado por teste com `jsdom` |
| Copy de honestidade do score | done | P0 | Ressalva acima da dobra; texto vem do domínio |
| Distinção das duas ausências no texto | done | P1 | "Não analisável" ≠ "fora do limite de truncagem" |
| **Design spec do Designer** | blocked | P0 | Espera a OQ-3 |
| **Apresentação final do score** | blocked | P0 | A régua pode virar percentil ou faixa nomeada |
| Sugestões de melhoria por sentença | not started | P1 | Adapter é um no-op hoje |
| Teste do disclaimer acima da dobra | not started | P2 | Requisito posicional; inverificável sem navegador. Registrado como débito |

### M4 — Hardening + deploy (target 2026-09-17) — **é o que falta para publicar**

| Item | Status | Priority | Notes |
|------|--------|----------|-------|
| **Rate limiting por IP (Upstash Redis)** | not started | P0 | **Bloqueador de deploy.** OQ-2 aprovada |
| **Budget guard com teto diário (Redis)** | not started | P0 | **Bloqueador de deploy.** US$ 1/dia |
| **Corrigir TOCTOU / DNS rebinding** | not started | P0 | **Bloqueador de deploy.** Exige fixar o IP via conector do undici |
| Endurecer `clientKeyOf` (`x-forwarded-for`) | not started | P1 | Ponto único, junto com o rate limiter real |
| Registro de custo real por análise | done | P1 | `ConsoleCostRecorder`; sem banco, por decisão de produto |
| Truncagem sinalizada no relatório | done | P1 | Campo `truncated` + aviso na tela |
| Tratamento de erro por código | done | P0 | 15 códigos mapeados; 500 genérico sem vazar stack |
| Deploy público na Vercel | not started | P1 | Só depois dos três P0 acima |
| Smoke test em produção | not started | P1 | ≥3 URLs reais, e verificar as guardas **em produção** |

### Change 002 — motor LLM puro (especificado, NÃO implementado)

Origem: a calibração derrubou a premissa do motor híbrido. Ver
[ADR-006](../specs/decisions/006-prefiltro-deixa-de-decidir.md).
**Não bloqueia o deploy.**

| Item | Status | Priority | Notes |
|------|--------|----------|-------|
| Remover `PrefilterVerdict`, adicionar `SentenceAnnotation` | not started | P1 | Domínio primeiro: o compilador vira a checklist |
| `RulePrefilter.evaluate` → `annotate` | not started | P1 | Sai `strongSource` e o caso OPINION direto |
| `AnnotatingClassifier` substitui `HybridClassifier` | not started | P1 | Decorator: delega e enriquece, não roteia |
| Deletar testes de decisão por regra | not started | P1 | **Deletar, não desabilitar** |
| `Classification.signals` preenchido de verdade | not started | P1 | Hoje vazio em 100% das classificações reais |

### Qualidade e processo

| Item | Status | Priority | Notes |
|------|--------|----------|-------|
| Suíte de testes | done | P0 | **401 testes**; `CI=true` falha se fixtures faltarem |
| **Cinco** rodadas de revisão | done | P0 | A última pegou um bug de CSS que a revisão de código anterior deixou passar |
| Commits publicados | done | P0 | **6 commits**, versão **0.4.0** |
| Reconciliar débito de spec | in progress | P2 | Cresceu com esta rodada: 4 mudanças de contrato novas em `tasks.md` |
| Comitar estes artefatos atualizados | not started | P1 | Docs-as-code — trabalho do Shipper |

### Roadmap pós-v1

| Item | Status | Priority | Notes |
|------|--------|----------|-------|
| Medição real de citação em motores de AI | not started | P2 | Valida a premissa central do produto. Caro e frágil |
| Análise em lote (sitemap / CSV) | not started | P2 | Batch API dá 50% de desconto |
| Contas + histórico + evolução do score | not started | P2 | Exige auth e schema |
| Export PDF / white-label | not started | P2 | Demanda de agência, não do usuário v1 |
| Entrada por texto colado e upload | not started | P2 | Ampliação de entrada |
