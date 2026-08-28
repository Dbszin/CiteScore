---
created_at: 2026-08-27
updated_at: 2026-08-27
project_name: citescore
---

# Context Resume: CiteScore

> Leia este arquivo primeiro ao retomar o projeto. Ele reflete o estado atual, não o histórico — para o histórico, veja `session-log.md`.

## Project Summary

CiteScore é um web app de análise de conteúdo para SEO. O usuário informa a URL de um artigo e o sistema extrai o conteúdo principal, segmenta em sentenças e classifica cada uma em três categorias: afirmação com dado/fonte, afirmação sem fonte, ou opinião. A partir dessa distribuição calcula um **score de densidade factual**, apresentado como **estimativa** de quão citável o conteúdo é por motores de AI — e não como citação medida. O relatório entrega o score, o breakdown por categoria, o texto destacado sentença por sentença e sugestões de reescrita para as afirmações fracas. O v1 é análise avulsa: sem login, sem banco, sem histórico.

## Current Phase

**Pré-arquitetura.** Discovery concluído e escopo do v1 travado. Nenhuma linha de código escrita, nenhum commit no repositório, `specs/` ainda não existe. O único conteúdo do projeto são estes quatro artefatos em `docs/`.

## Last Session Highlights

- Escopo do v1 definido em 3 rodadas de discovery no CrewLoop Hub (2026-08-27).
- Decisão crítica: citabilidade em AI é **score heurístico (proxy)**, não medição real em motores de AI. Isso obriga a UI a rotular o score como estimativa.
- Motor escolhido: **híbrido** — pré-filtro determinístico + LLM (Claude API) nos casos ambíguos.
- Entrada limitada a **URL única**. Sem login, sem banco, sem histórico.
- Marcos organizados com **risco primeiro**: o motor de análise (M2) precede a UI (M3).
- Prazo "o quanto antes" → datas-alvo agressivas de ~3 semanas, marcadas como alvo e não compromisso.

## Open Questions

Todas para o **Architect** decidir, exceto onde indicado:

- Framework de UI: Tailwind + shadcn/ui é o provável, mas não está decidido.
- Estratégia de extração de conteúdo principal: qual biblioteca/abordagem, e o que fazer com paywall, páginas JS-heavy e boilerplate agressivo.
- Desenho do pré-filtro determinístico: quais sinais e com que pesos definem cada categoria antes de chamar o LLM.
- Como o score é calculado a partir da distribuição das três categorias — a fórmula ainda não existe.
- Mecanismo de rate limiting e de budget guard: qual abordagem, e onde no fluxo.
- Provider de deploy (Vercel é o default óbvio para Next.js, mas não confirmado).
- Custo por análise: desconhecido. Só será medido em M2 e pode inviabilizar o produto gratuito.
- Confirmar a assunção de que o LLM é a Claude API — registrada no brief, nunca contestada pelo usuário, mas nunca confirmada explicitamente.
- **Para o Designer:** como comunicar que o score é estimado sem destruir a proposta de valor do produto.

## Next Actions

1. **Rodar o Architect** (`/architect`) para escrever as specs em `specs/changes/`. Bloqueia todo o resto — nenhum código antes da spec.
2. Rodar o **Designer** (`/designer`) para a direção visual do relatório, incluindo a copy de honestidade do score.
3. Rodar o **Engineer** seguindo a ordem dos marcos: M1 fundação, depois M2 motor, depois M3 UI, depois M4 hardening.
4. Não pular a validação manual do classificador em ~10 artigos reais (acceptance criteria de M2). Se o prazo apertar, cortar escopo de M3 — não essa validação.
5. Rodar o **Shipper** para comitar `docs/` junto com o primeiro commit do projeto (repo está com zero commits).
