# Proposal: Analisador de Densidade Factual (v1)

## Status
- **State:** active
- **Created:** 2026-08-27
- **Author:** @Dbszin

## Problem Statement

Motores de busca com AI (ChatGPT, Perplexity, AI Overviews) citam conteúdo de forma seletiva. A hipótese de mercado — hoje amplamente repetida no nicho de GEO/AI-SEO — é que conteúdo denso em afirmações verificáveis é citado com mais frequência do que conteúdo denso em opinião.

Um profissional de SEO in-house que quer agir sobre essa hipótese hoje não tem instrumento. Ele lê o próprio artigo e não consegue responder: *quantas das minhas afirmações estão penduradas sem fonte?* A revisão é manual, subjetiva e não escala.

O CiteScore instrumenta essa leitura: recebe uma URL, classifica cada sentença e devolve um número mais o mapa exato de onde o texto está fraco.

**O problema honesto por trás do problema:** a correlação entre densidade factual e citação real por motores de AI **não foi medida por nós**. O produto vende um proxy. Isso não invalida o produto — instrumentar densidade factual tem valor editorial próprio, independente de AI — mas invalida qualquer copy que afirme citação medida. Este risco é tratado como requisito de arquitetura em [ADR-004](../../decisions/004-honestidade-como-contrato.md), não como decisão de marketing.

## Goals

1. **Classificar cada sentença** de um artigo em três categorias — afirmação com dado/fonte, afirmação sem fonte, opinião — com qualidade conferida manualmente antes de qualquer exposição pública.
2. **Entregar um score reproduzível e versionado** derivado dessa distribuição, com a fórmula documentada e auditável.
3. **Tornar o resultado acionável**: highlight inline por sentença e sugestão de reescrita para as afirmações fracas. O número sozinho não muda comportamento; o mapa muda.
4. **Manter o custo por análise conhecido e limitado**, com teto de gasto que não depende de disciplina do visitante.
5. **Nunca afirmar citação medida.** O caráter estimado do score é campo obrigatório do contrato de API, não texto opcional de rodapé.

## Non-Goals

Fora do escopo do v1, por decisão registrada no discovery:

- Medição real de citação em ChatGPT / Perplexity / Google AI Overviews
- Análise em lote (sitemap, CSV, múltiplas URLs)
- Contas de usuário, histórico por URL, evolução do score no tempo
- Export PDF, white-label, visão multi-cliente de agência
- Upload de arquivo (.md, .docx, .pdf) e entrada por texto colado
- Monetização, billing, planos
- Suporte multi-idioma além de PT-BR e EN (ver Constraints)

## Constraints

- **Stack fixada pelo usuário:** Next.js + TypeScript. Não é decisão aberta.
- **LLM:** Claude API. Modelo default `claude-opus-5` — ver [ADR-005](../../decisions/005-modelo-llm-e-custo.md) e OQ-1.
- **Sem banco de dados de produto e sem autenticação.** Consequência direta: o rate limit e o budget guard precisam de armazenamento de contador fora do processo, porque serverless não tem memória compartilhada entre invocações. Isso é infraestrutura, não banco de produto — a distinção está em [ADR-004](../../decisions/004-honestidade-como-contrato.md) e no spec delta de [proteção-custo](specs/protecao-custo/spec.md).
- **Idioma:** o pré-filtro determinístico é dependente de idioma. O v1 suporta **PT-BR** como idioma primário e **EN** como secundário. Idioma detectado fora desses dois retorna erro explícito em vez de score silenciosamente errado.
- **Repositório começa vazio:** zero commits. Não há código legado, convenção existente ou teste para preservar.
- **Prazo agressivo** ("o quanto antes"): ~3 semanas até deploy. A validação manual do classificador (M2) é a única etapa que não pode ser cortada.

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Endpoint público com LLM por análise é abusado e esgota a cota de API | High | Três defesas independentes, todas bloqueadoras de deploy: rate limit por IP, cap de conteúdo analisado, budget guard com teto diário. Especificadas em [protecao-custo](specs/protecao-custo/spec.md) |
| O score afirma correlação com citabilidade sem tê-la medido | High | `disclaimer`, `scoreVersion` e `methodology` são campos **obrigatórios** do payload de resposta, com teste que falha se ausentes. Nomenclatura primária é "Densidade Factual", não "Citabilidade" — [ADR-004](../../decisions/004-honestidade-como-contrato.md) |
| Classificação por sentença fica imprecisa e o produto perde credibilidade | High | `scripts/calibrate.ts` roda o motor em corpus versionado e emite relatório de concordância. Acceptance criteria de M2 exige conferência manual em ~10 artigos antes de M3 |
| Extração falha em paywall, página JS-heavy ou boilerplate agressivo | Medium | Tipos de página suportados delimitados explicitamente; cada modo de falha tem código de erro próprio e mensagem útil — [extracao](specs/extracao/spec.md) |
| Custo por análise inviabiliza o produto gratuito | High | `countTokens` pré-flight + registro de `usage` real por análise desde a primeira execução. Estimativa e lever de redução em [ADR-005](../../decisions/005-modelo-llm-e-custo.md) |
| Pesos do score mudam e scores antigos ficam incomparáveis sem ninguém notar | Medium | `scoreVersion` em toda resposta; alterar peso obriga incrementar a versão — [ADR-003](../../decisions/003-formula-do-score.md) |
| Pré-filtro determinístico escala quase tudo para o LLM e o híbrido perde a razão de existir | Medium | Meta explícita: ≤50% das sentenças escaladas. `decidedBy` registrado por sentença e a taxa é medida no relatório de calibração |
| Prazo comprime a calibração | Medium | Se algo escorregar, cortar escopo de M3 (sugestões por sentença são o primeiro corte). Nunca cortar a validação de M2 |

## Success Criteria

- [ ] Uma URL de artigo público em PT-BR entra e o relatório completo é renderizado: score, breakdown das 3 categorias, highlight inline e sugestões.
- [ ] Relatório de calibração gerado sobre ≥10 artigos reais, com a classificação conferida manualmente e considerada aceitável pelo usuário.
- [ ] Taxa de escalonamento ao LLM medida e ≤50% das sentenças analisáveis.
- [ ] Custo médio por análise medido em dólares a partir de `usage` real, não estimado.
- [ ] Nenhum caminho de código permite consumo ilimitado de LLM por visitante anônimo — verificado por teste.
- [ ] Payload de resposta rejeitado por teste se `disclaimer`, `scoreVersion` ou `methodology` estiverem ausentes.
- [ ] Cada modo de falha de extração (paywall, sem conteúdo, JS-heavy, idioma não suportado, timeout) retorna código de erro próprio e mensagem acionável — verificado por teste.
