---
created_at: 2026-08-27
updated_at: 2026-08-27
project_name: citescore
status: active
---

# Long-Term Plan: CiteScore

## Vision

Um web app onde um profissional de SEO cola a URL de um artigo e recebe, em segundos, a medida de quanto daquele conteúdo são afirmações sustentadas por dado ou fonte — apresentada como estimativa de citabilidade em motores de AI, com orientação concreta de reescrita por sentença.

## Goals

- **Motor confiável:** classificação por sentença (com dado/fonte, sem fonte, opinião) com concordância validada em pelo menos 10 artigos reais antes de expor a UI.
- **Resultado acionável:** todo relatório entrega não só o score, mas o texto destacado sentença por sentença e o que mudar em cada afirmação fraca.
- **Honestidade do score:** nenhuma tela afirma citação medida em motores de AI. O score é rotulado como estimativa derivada de densidade factual.
- **Custo sob controle:** deploy público não pode ser vulnerável a esgotamento de cota de LLM por abuso.
- **v1 no ar o quanto antes:** escopo travado, sem login e sem banco, para validar demanda rápido.

## Scope

### In scope

- Entrada por **URL única**: fetch da página + extração do conteúdo principal (remoção de boilerplate)
- **Motor híbrido:** pré-filtro determinístico (números, datas, unidades, links de fonte, marcadores de hedging) + Claude API nos casos ambíguos
- Classificação por sentença em 3 categorias: com dado/fonte, sem fonte, opinião
- Score de densidade factual + breakdown percentual por categoria
- Highlight inline do texto, colorido por classificação
- Sugestões de melhoria por sentença
- Rótulo explícito de que o score é proxy estimado, não citação medida
- Rate limiting, cap de tamanho de conteúdo e budget guard de LLM
- Análise avulsa: **sem login, sem banco, sem histórico**

### Out of scope

- Medição real de citação em ChatGPT / Perplexity / Google AI Overviews
- Análise em lote (sitemap, CSV, múltiplas URLs)
- Contas de usuário, histórico por URL, evolução do score no tempo
- Export PDF, white-label, visão multi-cliente de agência
- Upload de arquivo (.md, .docx, .pdf) e entrada por texto colado
- Monetização e billing

## Milestones

Datas são **alvo agressivo**, não compromisso. O usuário pediu "o quanto antes". M2 é o marco imprevisível: se o classificador exigir recalibração, o atraso se propaga para M3 e M4.

1. **M1 — Fundação** — Target: 2026-08-29
   - Especificações escritas pelo Architect em `specs/changes/`
   - Scaffold Next.js + TypeScript funcionando localmente
   - Variáveis de ambiente e acesso à Claude API configurados
   - Acceptance criteria: `npm run dev` sobe a aplicação e existe spec aprovada antes de qualquer código de produto.

2. **M2 — Motor de análise (o risco real)** — Target: 2026-09-05
   - Fetch de URL + extração de conteúdo principal
   - Segmentação em sentenças
   - Pré-filtro determinístico das 3 categorias
   - Classificação LLM dos casos ambíguos
   - Cálculo do score e do breakdown
   - Acceptance criteria: rodando em ~10 artigos reais e diversos, a classificação é conferida manualmente e considerada aceitável; o custo por análise é medido e conhecido.

3. **M3 — Relatório (UI)** — Target: 2026-09-12
   - Design spec do Designer
   - Score + breakdown por categoria
   - Highlight inline por sentença
   - Sugestões de melhoria por sentença
   - Copy de honestidade do score visível, não escondida em rodapé
   - Acceptance criteria: uma URL real entra e o relatório completo é renderizado, com a natureza estimada do score clara para quem nunca viu o produto.

4. **M4 — Hardening + deploy** — Target: 2026-09-17
   - Rate limiting por IP (e/ou desafio anti-bot)
   - Cap de tamanho de conteúdo analisado
   - Budget guard de gasto com LLM
   - Tratamento de erro para URL inacessível, paywall e conteúdo vazio
   - Deploy público
   - Acceptance criteria: nenhum caminho permite consumo ilimitado de LLM por visitante anônimo, e falhas de fetch retornam mensagem útil em vez de erro genérico.

## Constraints

- Stack fixada pelo usuário: **Next.js + TypeScript**
- LLM: **Claude API** (assunção registrada no brief, ainda não contestada pelo usuário)
- Sem banco de dados e sem autenticação no v1 — decisão de produto, não limitação técnica
- Repositório começa vazio: zero commits, remote `github.com/Dbszin/CiteScore`
- Projeto multi-sessão: o contexto precisa sobreviver a intervalos entre sessões
- Framework de UI e provider de deploy ainda não decididos (Architect/Designer)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Endpoint público com LLM por análise é abusado e esgota a cota de API | high | high | Rate limiting por IP, cap de tamanho de conteúdo e budget guard obrigatórios em M4, antes de qualquer exposição pública |
| O score afirma correlação com citabilidade em AI sem que ela tenha sido medida | high | high | Rotular como estimativa derivada de densidade factual em toda a UI; nunca prometer citação medida; validação real fica no roadmap |
| Classificação por sentença fica imprecisa e o produto perde credibilidade | medium | high | Acceptance criteria de M2 exige conferência manual em ~10 artigos reais antes de construir a UI |
| Extração de conteúdo falha em sites com paywall, JS-heavy ou boilerplate agressivo | high | medium | Tratamento explícito de erro em M4; delimitar tipos de página suportados no v1 |
| Custo por análise só é descoberto tarde e inviabiliza o produto gratuito | medium | high | Medir custo por análise já em M2, como parte do acceptance criteria |
| Prazo agressivo ("o quanto antes") comprime a calibração do classificador | medium | medium | M2 é o marco que não deve ser cortado; se algo escorregar, cortar escopo de M3, não a validação de M2 |
| Contexto se perde entre sessões e o projeto reinicia do zero | medium | medium | Estes quatro artefatos, atualizados ao fim de cada sessão |
