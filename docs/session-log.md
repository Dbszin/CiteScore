---
created_at: 2026-08-27
updated_at: 2026-08-27
project_name: citescore
---

# Session Log: CiteScore

Entradas novas são adicionadas no topo de `## Sessions`. Nunca sobrescrever entradas antigas.

## Sessions

### 2026-08-27 — Discovery inicial e definição de escopo do v1

- **Focus:** Primeira sessão do projeto. Repo vazio (zero commits). Transformar a ideia "Content Factual Density Analyzer" em escopo de v1 rastreável.

- **Key decisions:**
  - **Citabilidade em AI = score heurístico (proxy), não medição real.** Decisão consciente após confronto explícito das duas alternativas. Medição real em ChatGPT/Perplexity/AI Overviews fica no roadmap. Consequência: a UI é obrigada a rotular o score como estimativa.
  - **Usuário primário do v1:** marketer / SEO in-house analisando o conteúdo do próprio site.
  - **Entrada apenas por URL única.** Texto colado, upload de arquivo e análise em lote ficam fora do v1.
  - **Motor híbrido:** pré-filtro determinístico (números, datas, unidades, links de fonte, hedging) + LLM nos casos ambíguos. Escolhido em vez de LLM puro (custo) e de regras puras (raso demais).
  - **Sem login, sem banco, sem histórico.** Análise avulsa para chegar ao ar rápido e validar demanda.
  - **Output completo:** score + breakdown por categoria + highlight inline por sentença + sugestões de melhoria por sentença.
  - **Stack:** Next.js + TypeScript. LLM assumido como Claude API (assunção registrada, não contestada pelo usuário).
  - **Ritmo:** multi-sessão, com prazo "o quanto antes" — datas-alvo agressivas de ~3 semanas.
  - **Marcos com risco primeiro:** o motor de análise (M2) vem antes da UI, para que a falha do classificador seja descoberta na primeira semana e não na quarta.

- **Outcomes:**
  - Brief de escopo aprovado pelo CrewLoop Hub após 3 rodadas de discovery (11 decisões capturadas).
  - Dois riscos levantados e registrados para a arquitetura resolver: abuso/custo de LLM em endpoint público sem auth, e honestidade da afirmação de correlação com citabilidade.
  - Criados os quatro artefatos de acompanhamento multi-sessão em `docs/`.
  - Nenhum código escrito. Nenhum commit feito.

- **Next steps:**
  - Architect escreve as specs em `specs/changes/` — obrigatório antes de qualquer código.
  - Architect decide: framework de UI, estratégia de extração de conteúdo, desenho do pré-filtro determinístico, provider de deploy, e o mecanismo de rate limiting / budget guard.
  - Depois das specs: Designer para a direção visual do relatório (inclui a copy de honestidade do score).
  - Shipper deve comitar `docs/` junto com o primeiro commit do projeto.
