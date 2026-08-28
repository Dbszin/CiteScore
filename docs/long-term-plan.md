---
created_at: 2026-08-27
updated_at: 2026-08-28
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

1. **M1 — Fundação** — ✅ **CONCLUÍDO em 2026-08-28** (adiantado; target era 2026-08-29)
   - Especificações escritas pelo Architect em `specs/changes/`
   - Scaffold Next.js + TypeScript funcionando localmente
   - Variáveis de ambiente e acesso à Claude API configurados
   - Acceptance criteria: `npm run dev` sobe a aplicação e existe spec aprovada antes de qualquer código de produto.

2. **M2 — Motor de análise (o risco real)** — Target: 2026-09-05 · ⚠️ **PARCIAL E BLOQUEADO**
   - Feito e testado: fetch com defesas de SSRF, extração, decodificação de
     charset, guarda de página-índice, segmentação, pré-filtro de regras e
     cálculo do score.
   - Bloqueado: classificação LLM, caso de uso, rota e calibração — todos
     dependem de `ANTHROPIC_API_KEY`, ausente do ambiente. O bloqueio não é
     técnico nosso, e a data de 09-05 não se sustenta enquanto ele durar.
   - Fetch de URL + extração de conteúdo principal
   - Segmentação em sentenças
   - Pré-filtro determinístico das 3 categorias
   - Classificação LLM dos casos ambíguos
   - Cálculo do score e do breakdown
   - Acceptance criteria: rodando em ~10 artigos reais e diversos, a classificação é conferida manualmente e considerada aceitável; o custo por análise é medido e conhecido.

3. **M3 — Relatório (UI)** — Target: 2026-09-12 · depende de M2 fechar
   - Design spec do Designer
   - Score + breakdown por categoria
   - Highlight inline por sentença
   - Sugestões de melhoria por sentença
   - Copy de honestidade do score visível, não escondida em rodapé
   - Acceptance criteria: uma URL real entra e o relatório completo é renderizado, com a natureza estimada do score clara para quem nunca viu o produto.

4. **M4 — Hardening + deploy** — Target: 2026-09-17 · tem bloqueador próprio já identificado (TOCTOU)
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
- Projeto multi-sessão: o contexto precisa sobreviver a intervalos entre sessões
- Framework de UI e provider de deploy ainda não decididos (Architect/Designer)

**Atualizado em 2026-08-28:**

- O repositório **não está mais vazio**: commit `7d69fa7` em `origin/main`, 118 arquivos.
- A assunção de LLM = Claude API segue **não contestada e não confirmada**; o modelo default é `claude-opus-5`, trocável por variável de ambiente.
- **`ANTHROPIC_API_KEY` ausente do ambiente** é hoje a restrição mais dura do projeto: bloqueia o classificador e a calibração de M2.
- Runtime confirmado como **Node**, não Edge — o Readability precisa de implementação de DOM.

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

### Riscos revisados em 2026-08-28

Reavaliação à luz do que a primeira sessão de implementação mediu:

| Risk | Antes | Agora | O que mudou |
|------|-------|-------|-------------|
| Custo por análise inviabiliza o produto gratuito | medium/high | **medium/high** (mantido, agora dimensionado) | Estimativa de ~US$0,13 por análise com `opus-5`. Descoberta contra-intuitiva: a **saída domina 92% do custo**, então prompt caching rende só ~10%. O lever real é o tier do modelo — fator 5x até `haiku-4-5` |
| Extração falha em paywall / JS-heavy / boilerplate | high/medium | **medium/low** | Medido em 8 páginas reais. Cada modo de falha tem código de erro próprio, e apareceu um modo não previsto: paywall duro falha no **fetch** (403), não na extração |
| Classificação imprecisa e o produto perde credibilidade | medium/high | **medium/high** (mantido) | Ainda não medido — depende da chave de API. Mas o pré-filtro já revelou 4 bugs de padrão, todos achados por teste; a taxa real de acerto continua desconhecida |
| Prazo comprime a calibração | medium/medium | **high/medium** | M1 saiu adiantado, mas M2 está **bloqueado por fator externo**. O prazo agora depende de quando a chave aparecer, não da nossa velocidade |

### Riscos NOVOS, descobertos na implementação

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **SSRF** — o produto busca URL arbitrária de visitante anônimo a partir do servidor, o que é um proxy aberto para a rede interna | high | **critical** | Suíte de defesas implementada e testada com 53 casos: faixas privadas, loopback, metadata de nuvem, IPv4-mapeado em hex, revalidação após cada redirect, falha fechada. **Resta o TOCTOU / DNS rebinding, bloqueador de M4** |
| Bug silencioso em regex de sinal degrada o score sem erro nem log | high | high | Três ocorrências já aconteceram, todas achadas por teste. Bateria sistemática de 76 casos criada — mas o guarda de cobertura contra sinais novos está inerte e precisa de correção |
| Suíte de testes reporta verde sem ter validado nada | — | high | Já materializou-se: 16 testes ficavam `skipped` em clone limpo. Corrigido com fixtures mínimas versionadas + falha sob `CI=true` |
| Conteúdo PT-BR em latin-1 corrompe os sinais acentuados | high | high | Corrigido: decodificação respeita o charset declarado. Vale notar que o benchmark do `opencode` já havia sinalizado isso de forma independente |
| Código e ADRs divergem por correção direta no código | high | medium | 21 itens de débito registrados no topo de `specs/.../tasks.md`. Débito aceito conscientemente; visível, não enterrado |
