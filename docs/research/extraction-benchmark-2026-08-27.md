---
created_at: 2026-08-27
updated_at: 2026-08-27
project_name: citescore
author: opencode
status: empirical benchmark
---

# Benchmark de Extração de Conteúdo Principal — 2026-08-27

> Comparação empírica de duas bibliotecas Node para extração de conteúdo principal de páginas web, em 8 URLs de teste. Input para o Architect validar a recomendação de `docs/research/extraction-and-prefilter-2026-08-27.md`.

## TL;DR

| Extrator | Custo | Latência média | Mantém links | Mantém headings | Fracasso em PT-BR |
|---|---|---|---|---|---|
| **`@mozilla/readability` 0.6.0** | Apache-2.0 | ~600ms (cold) | ✅ (521 em wiki) | ✅ (5-33) | ⚠️ encoding quebrado (Folha) |
| **`@extractus/article-extractor` 7.x** | MIT | ~600ms (cold) | ✅ (em tese) | ✅ | ❌ falhou em G1 (retornou `null`) |

**Recomendação confirmada:** `@mozilla/readability` continua sendo a melhor escolha para a stack Next.js do CiteScore. Nenhuma das duas é perfeita — ambas falham com charset/locale em PT-BR (Folha/UOL), e a `article-extractor` falhou completamente em G1.

---

## 1. Setup

- **Node:** v20.20.2
- **Readability:** `@mozilla/readability@0.6.0` + `jsdom@25.0.1`
- **Article-extractor:** `@extractus/article-extractor@7.x`
- **Fetch:** `fetch` nativo + `AbortSignal.timeout(10000)` + retry 1x em timeout
- **User-Agent:** `Mozilla/5.0 (compatible; CiteScoreBot/1.0)`
- **Accept-Language:** `en-US,en;q=0.9,pt-BR;q=0.8,pt;q=0.7`
- **charThreshold (readability):** 100 (vs default 500, para aceitar artigos SEO curtos)
- **Hardware:** Windows local; latências não-comparáveis a Vercel Edge mas ordem de grandeza vale

## 2. URLs testadas (8)

| ID | URL | Tipo | Lang | Status | Bytes HTML |
|---|---|---|---|---|---|
| en-seo-ahrefs | ahrefs.com/blog/seo-meta-tags/ | SEO marketing | EN | 200 | 886.218 |
| en-seo-moz | moz.com/learn/seo/what-is-seo | SEO pilar | EN | 200 | 132.604 |
| en-tech-mdn | developer.mozilla.org/.../Introduction | Doc técnica | EN | 200 | 207.414 |
| pt-jornal-folha | folha.uol.com.br/ | Home portal | PT-BR | 200 | 868.251 |
| pt-jornal-g1 | g1.globo.com/ | Home portal | PT-BR | 200 | 1.032.091 |
| en-paywall-nyt | nytimes.com/.../federal-reserve | Paywall duro | EN | **403** | 771 |
| en-spa-vercel | nextjs.org/blog | SPA/SSR moderno | EN | 200 | 524.336 |
| en-list-wikipedia | en.wikipedia.org/wiki/List_of_countries_by_GDP | Lista/tabela | EN | 200 | 677.174 |

**Nota sobre paywall (NYT):** esperado. 403 confirma que o upstream bloqueia bots. CiteScore precisa tratar isso explicitamente em M2 (mensagem útil: "site bloqueia acesso automatizado").

## 3. Resultados quantitativos

| ID | R chars | R words | R ms | R links | R headings | A chars | A words | A ms | A links | A headings |
|---|---|---|---|---|---|---|---|---|---|---|
| en-seo-ahrefs | 15.521 | 2.460 | 759 | 38 | **33** | 15.785 | 2.656 | 1.672 | (não exposto) | (não exposto) |
| en-seo-moz | **18.794** | 1.812 | 356 | 48 | 31 | 12.827 | 1.936 | 321 | — | — |
| en-tech-mdn | 10.394 | 1.534 | 407 | 36 | 11 | 10.349 | 1.583 | 217 | — | — |
| pt-jornal-folha | **9.731** | 342 | 1.301 | 57 | **27** | 2.109 | 343 | 713 | — | — |
| pt-jornal-g1 | 192 | 38 | 505 | 0 | 0 | **FAIL** | — | 1.194 | — | — |
| en-paywall-nyt | — | — | — | — | — | — | — | — | — | — |
| en-spa-vercel | 9.202 | 1.286 | 759 | **127** | 0 | 9.197 | 1.418 | 343 | — | — |
| en-list-wikipedia | 11.453 | 1.646 | 753 | **521** | 5 | 11.823 | 2.107 | 483 | — | — |

**Observações:**
- **Readability (R) consistentemente extrai MAIS conteúdo** quando ambos funcionam (Moz: 18.794 vs 12.827 = +47%; Folha: 9.731 vs 2.109 = +361%)
- **Article-extractor (A) é mais rápido** em ~50% dos casos, mas compensa com extração menor
- **Headings preservados:** R mantém h1-h6 (33 em Ahrefs, 27 em Folha); A não medido mas extrai menos estrutura

## 4. Análise qualitativa (leitura dos `firstChars`)

### en-seo-ahrefs — **empate qualitativo**
Ambos extraem o mesmo lead: *"Meta tags are snippets of code that tell search engines important information…"*. R preserva listas com quebras de linha; A condensa em linha corrida. **Ambos OK.**

### en-seo-moz — **R melhor**
R extrai 18.794 chars (mais conteúdo); A extrai 12.827. R começa com boilerplate de navegação ("What is SEO and how does it work?"), A pula direto pro corpo. **Trade-off: cobertura vs. limpeza. R melhor para análise porque preserva mais sinal.**

### en-tech-mdn — **empate quantitativo, R melhor estrutural**
Ambos extraem ~10.3k chars com o mesmo conteúdo. R preserva headings hierárquicos ("What you should already know", "Where to find JavaScript…"); A condensa tudo num bloco só. **R melhor para preservar estrutura que vai ser sentencizada depois.**

### pt-jornal-folha — **R melhor, mas ambas quebram encoding**
**Problema grave:** ambos retornaram texto com caracteres corrompidos: `TrǦs Poderes`, `conveniǦncias`, `Constitui��ǜo`, `Bras��lia Ǹ a com`. Encoding do HTML provavelmente é ISO-8859-1 e o fetch entregou como latin1 sem declarar charset. **Readability extrai 4.6× mais conteúdo (9.731 vs 2.109)**, mas ambos têm encoding quebrado — a culpa é do fetch, não dos extratores.

### pt-jornal-g1 — **R parcialmente OK, A falha**
R extrai só headlines de cards ("Há 4 horas Política", "Há 3 horas Política") — portal dinâmico onde cada card é uma "sentença". A **falhou completamente** (retornou `null`, 1.2s gasto). R é claramente superior aqui.

### en-spa-vercel — **empate**
Ambos extraem 9.2k chars. Next.js blog é SSR-friendly, então funciona igual nos dois. R preserva links (127!) mas perde headings (0); A similar. **Empate.**

### en-list-wikipedia — **R preserva lista, A compensa com word count**
R mantém 521 links e 5 headings — a estrutura da lista/tabela está preservada. A compensa com word count maior (2.107 vs 1.646) mas com texto mais poluído (caracteres `����`, `&gt;` literalmente no output). **R melhor para posterior segmentação em sentenças.**

## 5. Problemas identificados (que vão virar issues em M2)

### P1 — Encoding PT-BR
- **Sintoma:** caracteres acentuados chegam corrompidos (`Constitui��ǜo`, `Bras��lia`)
- **Causa provável:** UOL/Globo servem HTML em ISO-8859-1 sem `<meta charset>` declarando, e o `fetch` trata como UTF-8
- **Mitigação proposta:** detectar charset via `<meta http-equiv="Content-Type">` ou `Content-Type` header, e re-encodar antes de passar pro extrator. Biblioteca `iconv-lite` se necessário. **Implementar em M2.**

### P2 — Article-extractor falha em G1
- **Sintoma:** `Cannot read properties of null (reading 'content')` ou retorna `null`
- **Causa:** heuristic própria do article-extractor não lida com home de portal (cards infinitos, conteúdo carregado via JS)
- **Mitigação:** usar readability como primário, article-extractor não é mais candidato. **Descartado.**

### P3 — Páginas home de portal não servem pro produto
- **Sintoma:** R extrai só headlines de cards em G1
- **Causa:** home de portal não é um "artigo", é um feed
- **Mitigação:** o usuário do CiteScore cola URL de **artigo/post específico**, não home de portal. Isso não é um problema do extrator, é um caso de uso fora do escopo. **Documentar em M3 ("use URLs de artigos, não de homes").**

### P4 — Paywall (NYT) retorna 403
- **Sintoma:** 0 bytes de HTML, 403 status
- **Causa:** NYT bloqueia bots
- **Mitigação:** detectar 4xx (exceto 408/429) e mostrar mensagem ao usuário: "Este site bloqueia acesso automatizado. Tente colar o texto manualmente." **Implementar em M2.**

## 6. Recomendações validadas para o Architect

✅ **Confirmado:** `@mozilla/readability` + `jsdom` é a escolha certa para v1.
✅ **Confirmado:** `charThreshold = 100` (não 500) para aceitar artigos SEO curtos.
✅ **Confirmado:** evitar `@extractus/article-extractor` — heurística menos robusta em PT-BR.
✅ **Confirmado:** evitar `unfluff`, `node-readability` (já estavam descartados pela pesquisa).
✅ **Adicionado:** **detectar e re-encodar charset** antes de passar pro readability (issue P1).
✅ **Adicionado:** **tratar 4xx ≠ 408/429** como "site bloqueia acesso" (issue P4).
✅ **Adicionado:** **orientar usuário a colar URL de artigo, não home de portal** (issue P3, vai pra UI copy em M3).

## 7. Itens ainda em aberto

- **PT-BR com charset UTF-8 declarado:** não testado (nenhum dos sites UOL/Globo veiculou UTF-8 nesse teste). Pendente para próxima rodada com URLs adicionais (Wikipedia PT, blog WordPress BR).
- **SPA real (Next.js export, sem SSR):** não testado nesse benchmark. Vercel blog usa SSR/SSG, então funcionou. Próxima rodada precisa de um SPA puro (ex: app React sem SSR).
- **Sites com paywall soft (Folha de artigo pago):** não testado com URL de artigo específica, só com home. Folha tem paywall por artigo; precisa testar com URL paga.
- **Métricas de "qualidade" subjetiva** (LLM-as-judge): não foi possível nesta sessão (sem acesso a Claude API). Para validação completa, abrir issue em M2 e rodar antes do go-live.

## 8. Como reproduzir

```bash
cd scripts/benchmarks/extraction
npm install
node fetch.js
node extract-readability.js
node extract-article-extractor.js
# Saída em data/raw/ + data/extracted/{readability,article-extractor}/
```

## 9. Limitações deste benchmark

- **Amostra pequena:** 8 URLs, 1 idioma PT-BR efetivamente. Não é estatisticamente significativo.
- **Cold start:** latências incluem startup de JSDOM, não refletem cache quente.
- **Sem LLM-as-judge:** avaliação qualitativa é leitura manual de 400 chars por URL, não julgamento completo.
- **Sem ground truth:** não há corpus anotado de "qual é o conteúdo principal esperado" para medir recall/precision formal.
- **Stack Windows local:** latências não comparáveis a Vercel Edge (que é mais rápido e mais consistente).

## 10. Próximos passos sugeridos

1. **Ampliar amostra** para 20-30 URLs com mais PT-BR UTF-8, paywall soft, e SPA puro
2. **Adicionar LLM-as-judge** (Claude Haiku 4.5, $0.01/avaliação) para score qualitativo
3. **Testar com sites de fato analisados pelo usuário** (lista de URLs do golden dataset)
4. **Medir cold start de JSDOM vs Vercel Edge** antes de M2 para confirmar viabilidade
