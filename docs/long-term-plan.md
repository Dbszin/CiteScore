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

2. **M2 — Motor de análise (o risco real)** — ✅ **CONCLUÍDO em 2026-08-28** · a arquitetura do motor caiu no caminho
   - Pipeline completo entregue e rodando em artigos reais: fetch com defesas
     de SSRF, extração, charset, guarda de página-índice, segmentação,
     classificação LLM e score.
   - **A calibração derrubou a premissa do motor:** o pré-filtro resolve 0,3%
     dos casos, não os 50% da ADR-002. O motor é LLM puro na prática. O change
     002 formaliza isso e ainda não foi implementado.
   - **Custo medido:** US$ 0,05 por artigo, 7x a projeção.
   - **Pendente do acceptance criteria:** a conferência manual das 331
     sentenças do CSV, e rodar o corpus completo (OQ-3).
   - Fetch de URL + extração de conteúdo principal
   - Segmentação em sentenças
   - Pré-filtro determinístico das 3 categorias
   - Classificação LLM dos casos ambíguos
   - Cálculo do score e do breakdown
   - **O motor virou aplicação:** caso de uso, container e rota HTTP entregues.
     Uma URL entra pela tela e o relatório sai. Verificado em uso real.
   - **Custo real medido pela rota: US$ 0,0155 por artigo** — 3x menor que os
     US$ 0,05 da calibração, que media artigos maiores.
   - **Pendente, e não bloqueia nada:** a conferência manual das 331 sentenças
     do CSV.
   - Acceptance criteria: rodando em ~10 artigos reais e diversos, a classificação é conferida manualmente e considerada aceitável; o custo por análise é medido e conhecido.

3. **M3 — Relatório (UI)** — Target: 2026-09-12 · ⛔ **BLOQUEADO, com uma tela provisória já no ar**
   - Bloqueado pela [ADR-007](../specs/decisions/007-escala-do-score.md): a
     escala do score pode mudar, e desenhar a apresentacao sobre uma regua
     instavel e retrabalho garantido. Destrava com a OQ-3.
   - **Existe uma tela funcional, construída de propósito como provisória.**
     Ela respeita o bloqueio: nenhuma decisão de design foi tomada sobre a
     apresentação do score. O que ela cumpre são os requisitos de **contrato**
     da ADR-004, que independem de direção visual — score nunca sem breakdown
     (garantido pelo tipo), ressalva acima da dobra, "Densidade Factual" como
     rótulo primário.
   - O que segue bloqueado é o marco de verdade: Designer, design system e a
     apresentação final do score.
   - Design spec do Designer
   - Score + breakdown por categoria
   - Highlight inline por sentença
   - Sugestões de melhoria por sentença
   - Copy de honestidade do score visível, não escondida em rodapé
   - Acceptance criteria: uma URL real entra e o relatório completo é renderizado, com a natureza estimada do score clara para quem nunca viu o produto.

4. **M4 — Hardening + deploy** — Target: 2026-09-17 · ⬅️ **É AQUI QUE O PROJETO ESTÁ. É o que separa o produto do link da Vercel.**
   - Três bloqueadores de deploy: rate limiter (Redis), budget guard (Redis) e
     TOCTOU/DNS rebinding.
   - Hoje um deploy **falha no primeiro request, de propósito** — a guarda
     `assertNotProduction` derruba os adapters de desenvolvimento em produção.
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

**Atualizado ao fim de 2026-08-28 (segunda atualização do dia):**

- **6 commits publicados, versão 0.4.0.** O projeto deixou de ser "motor sem
  aplicação": `POST /api/analyze` responde e a tela em `/` entrega o relatório.
- **O custo real caiu para um terço do estimado.** US$ **0,0155** por artigo,
  medido pela rota, contra os US$ 0,05 da calibração. O teto aprovado de
  US$ 1/dia comporta ~65 análises, não ~20.
- **O que falta para publicar são três itens de M4**, todos conhecidos e
  especificados: rate limiter e budget guard com Upstash Redis, e o TOCTOU.
- **A guarda de produção funciona como projetada, e isso foi verificado em
  execução:** importar o container sob `NODE_ENV=production` não faz nada;
  construí-lo lança. É a instanciação preguiçosa que permite `next build`
  passar, sem desligar a defesa onde ela importa.
- **Uma lição de verificação, cara o suficiente para registrar aqui:** um bug
  de especificidade de CSS anulava o destaque inline — o recurso P0 que torna
  o resultado acionável — e passou por revisão de código. A tela não parecia
  quebrada; parecia uma decisão de design. Entrou por leitura, só sairia por
  execução. É o mesmo padrão dos três bugs de regex das tabelas de sinais.

**Atualizado ao fim de 2026-08-28 (primeira atualização):**

- **5 commits publicados**, versão 0.3.0.
- **`ANTHROPIC_API_KEY` presente** em `.env.local`. Modelo em uso:
  `claude-haiku-4-5` (OQ-1 respondida). **Pendente: rotacionar a chave**, que
  transitou por arquivo versionado durante o incidente desta sessão.
- **O "motor híbrido" descrito em Scope não existe na prática.** Ver
  [ADR-006](../specs/decisions/006-prefiltro-deixa-de-decidir.md): o
  pré-filtro passa a anotar, não a decidir.
- Runtime confirmado como **Node**, não Edge — o Readability precisa de DOM.
- **A restrição mais dura hoje não é técnica:** é a falta de base empírica
  para a escala do score, que mantém M3 bloqueado.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Endpoint público com LLM por análise é abusado e esgota a cota de API | high | high | Rate limiting por IP, cap de tamanho de conteúdo e budget guard obrigatórios em M4, antes de qualquer exposição pública |
| O score afirma correlação com citabilidade em AI sem que ela tenha sido medida | high | high | Rotular como estimativa derivada de densidade factual em toda a UI; nunca prometer citação medida; validação real fica no roadmap |
| Classificação por sentença fica imprecisa e o produto perde credibilidade | medium | high | Acceptance criteria de M2 exige conferência manual em ~10 artigos reais antes de construir a UI |
| Extração de conteúdo falha em sites com paywall, JS-heavy ou boilerplate agressivo | high | medium | Tratamento explícito de erro em M4; delimitar tipos de página suportados no v1 |
| Custo por análise só é descoberto tarde e inviabiliza o produto gratuito | ~~medium~~ **baixa** | ~~high~~ **medium** | **Resolvido por medição:** US$ 0,0155/artigo pela rota real. O teto de US$ 1/dia comporta ~65 análises. Deixa de ser risco de viabilidade e vira parâmetro de operação |
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

---

## Risco materializado em 2026-08-28

O risco "classificacao imprecisa e o produto perde credibilidade" foi medido, e
o resultado foi diferente do esperado: **a classificacao do LLM parece boa** —
os perfis por artigo fazem sentido, com documentacao tecnica pontuando pouca
opiniao e blog de SEO pontuando muita. O que falhou foram duas outras coisas:

| O que falhou | Medida | Consequencia |
|---|---|---|
| **Premissa do motor hibrido** | Pre-filtro resolve 0,3%, nao 50% | Motor e LLM puro na pratica; change 002 formaliza |
| **Escala do score** | 3 artigos distintos: 17, 23, 24 | Nao discrimina; M3 bloqueado ate haver base |
| **Projecao de custo** | US$ 0,05/artigo, nao US$ 0,007 | Defesas de M4 dimensionadas sobre numero errado |

**A licao mais cara, registrada para nao se repetir:** a ADR-002 foi escrita a
partir de sentencas de EXEMPLO. Sentencas de exemplo contem os marcadores que
as regras procuram, porque foram escritas para conte-los. Prosa real nao. Toda
premissa sobre "o texto costuma ter X" precisa ser medida em corpus antes de
virar arquitetura.

Uma consequencia positiva vale registro: a arquitetura hexagonal da ADR-001 se
provou. Inverter a responsabilidade central do motor — de decisor por regra
para LLM puro — nao atravessa a fronteira do dominio. A porta `ClaimClassifier`
nao muda.

---

## Riscos revisados em 2026-08-28, depois da aplicação existir

| Risk | Antes | Agora | O que mudou |
|------|-------|-------|-------------|
| Endpoint público com LLM é abusado e esgota a cota | high/high | **high/high** (mantido, agora dimensionado) | O custo real de US$ 0,0155 significa que 1.000 requisições abusivas custam ~US$ 15, não ~US$ 50. Continua inaceitável sem guarda — e a guarda `assertNotProduction` impede fisicamente o deploy sem ela |
| Extração falha em paywall / JS-heavy / boilerplate | medium/low | **medium/low** (mantido) | Cada modo de falha tem código de erro e mensagem de usuário. Verificado em real: paywall duro falha no fetch (403), home de portal vira `INDEX_PAGE` |
| Classificação imprecisa e o produto perde credibilidade | medium/high | **medium/high** (mantido) | A classificação de moz.com faz sentido qualitativamente, mas 331 sentenças seguem sem conferência humana |
| Prazo comprime a calibração | high/medium | **medium/medium** | M2 fechou. O caminho até o deploy agora é trabalho conhecido, não descoberta |
| **Bug visual silencioso degrada o produto sem erro nem log** | — | **medium/medium** (NOVO) | Materializou-se: o destaque inline ficou sem cor de fundo e passou por revisão. Mitigado com teste de cascata via `jsdom`, mas a superfície visual não coberta por teste segue grande — e o disclaimer posicional é o exemplo declarado |
