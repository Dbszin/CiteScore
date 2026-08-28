---
created_at: 2026-08-27
updated_at: 2026-08-27
project_name: citescore
author: opencode
status: candidate list for M2 — not yet annotated
---

# Golden Dataset — URLs Candidatas

> Lista curada de URLs reais para o acceptance criteria de M2 (`progress-checklist.md:32`: "validação manual em ~10 artigos reais"). Não estão anotadas ainda — quando M2 começar, o Engineer/Tester baixa, processa via pré-filtro + LLM, e confere manualmente se a classificação por sentença está correta.
>
> Critérios de seleção:
> - Sites estáveis e públicos (sem paywall duro)
> - Mix de idioma (50% EN, 50% PT-BR)
> - Mix de tipo e caso de teste
> - Cada URL tem **propósito de teste** explícito

## Convenção de tipo de teste

| Tag | O que testa |
|---|---|
| `A-dominante` | Artigo com alta densidade de afirmações com dado/fonte — pré-filtro A deve acertar muito |
| `C-dominante` | Artigo com predominância de opinião/hedge — pré-filtro C deve acertar muito |
| `B-dominante` | Artigo técnico/explicativo com claims sem dado (vai muito pro LLM) |
| `MIX` | Distribuição balanceada entre A, B e C |
| `LISTA-TABELA` | Listas e tabelas densas — stress test de segmentação em sentenças |
| `CURTO` | Artigo SEO curto (300-500 palavras) — `charThreshold=100` deve aceitar |
| `PAYWALL-SOFT` | Paywall parcial (snippet visível) — texto extraído < 200 palavras |
| `PESQUISA` | Estudo/relatório com muitos dados estruturados (tabelas, percentuais) |
| `OPINIAO-PURA` | Editorial/crítica sem dado factual — pré-filtro C deve dominar |
| `TECNICO` | Documentação técnica com termos, código, definições |

## EN — 18 URLs

### SEO marketing (3)

1. **https://ahrefs.com/blog/seo-meta-tags/**
   - Tipo: MIX
   - Tamanho: ~2.500 palavras
   - Por que testar: clássico SEO blog, lista de 6 meta tags com exemplos práticos, presença de números e hedge misturados

2. **https://moz.com/learn/seo/what-is-seo**
   - Tipo: A-dominante
   - Tamanho: ~1.800 palavras
   - Por que testar: página pilar com definições + dados ("Google processes 8.5B searches/day"), modelo de como "bom" artigo SEO factual se parece

3. **https://backlinko.com/hub/seo/page-speed**
   - Tipo: MIX
   - Tamanho: ~3.000 palavras
   - Por que testar: lista de técnicas com citações, affiliate CTAs inline (testa se a remoção de boilerplate funciona)

### Opinião pura (2)

4. **https://stratechery.com/2024/ai-and-the-big-five/**
   - Tipo: OPINIAO-PURA
   - Tamanho: ~3.000 palavras
   - Por que testar: análise opinativa de Ben Thompson — hedge pesado, primeira pessoa, claims interpretativos. Pré-filtro C deve dominar

5. **https://www.theatlantic.com/ideas/archive/2024/social-media-democracy/**
   - Tipo: C-dominante
   - Tamanho: ~2.500 palavras
   - Por que testar: ensaio/opinião com argumento + citação, mas maior parte é interpretação

### Técnico (3)

6. **https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Introduction**
   - Tipo: B-dominante
   - Tamanho: ~1.500 palavras
   - Por que testar: docs técnicas com definições (B), algum dado histórico, código inline (irrelevante pro analyzer)

7. **https://en.wikipedia.org/wiki/Transformer_(deep_learning_architecture)**
   - Tipo: A-dominante
   - Tamanho: ~5.000 palavras
   - Por que testar: enciclopédia pura, muita citação acadêmica, datas, números. Referência de "A perfeito"

8. **https://stripe.com/blog/payment-api-design**
   - Tipo: MIX
   - Tamanho: ~2.000 palavras
   - Por que testar: blog de engenharia com argumento técnico + alguns dados, modelo de post de tech company

### Curto (2)

9. **https://ahrefs.com/blog/canonical-tags/**
   - Tipo: CURTO + MIX
   - Tamanho: ~400 palavras
   - Por que testar: artigo SEO super curto, valida que `charThreshold=100` aceita e que ainda há análise válida

10. **https://www.semrush.com/blog/what-is-ctr/**
    - Tipo: CURTO + A-dominante
    - Tamanho: ~500 palavras
    - Por que testar: outro curto, mas com dado numérico claro (CTR benchmarks)

### Lista/tabela (2)

11. **https://en.wikipedia.org/wiki/List_of_countries_by_GDP_(nominal)**
    - Tipo: LISTA-TABELA
    - Tamanho: ~1.500 palavras + tabela grande
    - Por que testar: stress test de listas — readability vai capturar a tabela inteira? sentencex vai quebrar bem?

12. **https://www.statista.com/statistics/262858/change-in-online-ad-spending-worldwide/**
    - Tipo: PESQUISA
    - Tamanho: ~800 palavras + gráficos/tabela
    - Por que testar: site de estatística com muitos números, valida extração de dados quantitativos

### Paywall soft / snippet (2)

13. **https://www.nytimes.com/2024/03/15/business/media/news-websites-traffic.html**
    - Tipo: PAYWALL-SOFT
    - Tamanho esperado: ~150 palavras (snippet)
    - Por que testar: confirma que detectamos paywall e mostramos mensagem útil

14. **https://www.economist.com/finance-and-economics/2024/03/15/banking-crisis-lessons**
    - Tipo: PAYWALL-SOFT
    - Tamanho esperado: ~200 palavras
    - Por que testar: outro paywall de journalism premium, valida consistência da mensagem

### Jornalístico factual (2)

15. **https://www.bbc.com/news/business-68500000**
    - Tipo: A-dominante
    - Tamanho: ~600 palavras
    - Por que testar: notícia pura com números, datas, fontes. Referência de "A-dominante jornalístico"

16. **https://www.reuters.com/technology/artificial-intelligence/2024/03/15/ai-regulation-eu.html**
    - Tipo: A-dominante
    - Tamanho: ~500 palavras
    - Por que testar: news wire style — alta densidade de claims com fonte, sem opinião

### Pesquisa / whitepaper (2)

17. **https://www.mckinsey.com/capabilities/quantumblack/our-insights/the-state-of-ai-in-2023**
    - Tipo: PESQUISA
    - Tamanho: ~5.000 palavras
    - Por que testar: relatório de consultoria — MUITOS dados (perguntas de survey com %), algumas interpretações

18. **https://arxiv.org/abs/2303.08774**
    - Tipo: PESQUISA
    - Tamanho: ~300 palavras (abstract)
    - Por que testar: abstract de paper científico — termos técnicos, definições, números. Curto mas denso

---

## PT-BR — 18 URLs

### SEO marketing (3)

19. **https://resultadosdigitais.com.br/blog/o-que-e-seo/**
    - Tipo: MIX
    - Tamanho: ~2.000 palavras
    - Por que testar: blog de SEO brasileiro clássico, modelo do que o usuário do CiteScore vai analisar

20. **https://neilpatel.com/br/seo/**
    - Tipo: MIX
    - Tamanho: ~1.500 palavras
    - Por que testar: Neil Patel em PT — conteúdo traduzido, lista de técnicas com dados

21. **https://rockcontent.com/br/blog/marketing-de-conteudo/**
    - Tipo: MIX
    - Tamanho: ~2.500 palavras
    - Por que testar: blog de marketing brasileiro, mix de afirmações e opinião

### Opinião pura (2)

22. **https://www1.folha.uol.com.br/opiniao/2024/03/15/editorial-desafios-economia-brasileira.shtml**
    - Tipo: OPINIAO-PURA
    - Tamanho: ~600 palavras
    - Por que testar: editorial Folha — opinião institucional, sem dado explícito, opinião pura

23. **https://piaui.folha.uol.com.br/materia/algum-artigo/**
    - Tipo: C-dominante
    - Tamanho: ~3.000 palavras
    - Por que testar: revista piauí — ensaio/reportagem com voz autoral forte, hedge e interpretação

### Técnico (2)

24. **https://developer.mozilla.org/pt-BR/docs/Web/JavaScript/Guide/Introduction**
    - Tipo: B-dominante
    - Tamanho: ~1.500 palavras
    - Por que testar: mesma doc técnica em PT-BR — testa pré-filtro em PT

25. **https://pt.wikipedia.org/wiki/Intelig%C3%AAncia_artificial**
    - Tipo: A-dominante
    - Tamanho: ~8.000 palavras
    - Por que testar: enciclopédia PT-BR, valida que A-dominante funciona em PT

### Curto (2)

26. **https://rockcontent.com/br/blog/o-que-e-marketing-digital/**
    - Tipo: CURTO + MIX
    - Tamanho: ~400 palavras
    - Por que testar: artigo curto em PT, valida charThreshold em PT-BR

27. **https://www.sebrae.com.br/sites/PortalSebrae/artigos/o-que-e-marketing-digital**
    - Tipo: CURTO + B-dominante
    - Tamanho: ~350 palavras
    - Por que testar: artigo institucional curto, mais conceitual que factual

### Lista/tabela (2)

28. **https://pt.wikipedia.org/wiki/Lista_dos_maiores_rios_do_Brasil**
    - Tipo: LISTA-TABELA
    - Tamanho: ~1.000 palavras + tabela
    - Por que testar: stress test PT-BR de lista/tabela

29. **https://www.ibge.gov.br/estatisticas/economicas/contas-nacionais/9057-contas-regionais-do-brasil.html**
    - Tipo: PESQUISA
    - Tamanho: ~500 palavras + tabelas
    - Por que testar: site oficial IBGE, dados quantitativos pesados

### Paywall soft / snippet (2)

30. **https://www1.folha.uol.com.br/mercado/2024/03/15/economia-brasileira-cenarios.shtml**
    - Tipo: PAYWALL-SOFT
    - Tamanho esperado: ~150 palavras
    - Por que testar: Folha artigo pago, valida paywall em PT

31. **https://www.estadao.com.br/economia/2024/03/15/brasil-economia.shtml**
    - Tipo: PAYWALL-SOFT
    - Tamanho esperado: ~100 palavras
    - Por que testar: Estadão paywall, outro ângulo

### Jornalístico factual (2)

32. **https://g1.globo.com/economia/noticia/2024/03/15/ibge-inflacao-fevereiro.ghtml**
    - Tipo: A-dominante
    - Tamanho: ~400 palavras
    - Por que testar: notícia G1 com dados oficiais, modelo de A-dominante PT

33. **https://www.bbc.com/portuguese/articles/c0ln53pn2z4o**
    - Tipo: A-dominante
    - Tamanho: ~600 palavras
    - Por que testar: BBC em PT, jornalismo factual, encoding UTF-8 (valida que PT-BR com UTF-8 funciona)

### Pesquisa / whitepaper (2)

34. **https://www.pwc.com.br/estudos-pesquisas/ceo-survey-2024.html**
    - Tipo: PESQUISA
    - Tamanho: ~2.000 palavras
    - Por que testar: pesquisa de consultoria em PT, dados quantitativos de survey

35. **https://www.ipea.gov.br/portal/publicacoes**
    - Tipo: PESQUISA
    - Tamanho: ~500 palavras
    - Por que testar: IPEA (instituto de pesquisa), altíssima densidade de dados, fonte primária

### Extra (1) — caso de teste especial

36. **https://twitter.com/fulano/status/123456**
    - Tipo: **inválido proposital**
    - Por que testar: social media não é artigo, deve falhar com mensagem útil
    - **Não é para anotar** — só para validar o tratamento de erro

---

## Resumo de cobertura

| Caso de teste | EN | PT-BR | Total |
|---|---|---|---|
| A-dominante | 2 (#7, #15, #16) | 2 (#25, #32, #33) | 6 |
| C-dominante / OPINIAO-PURA | 2 (#4, #5) | 2 (#22, #23) | 4 |
| B-dominante / TECNICO | 1 (#6) | 1 (#24) | 2 |
| MIX | 3 (#1, #2, #3) | 2 (#19, #20, #21) | 5 |
| CURTO | 2 (#9, #10) | 2 (#26, #27) | 4 |
| LISTA-TABELA | 1 (#11) | 1 (#28) | 2 |
| PESQUISA | 2 (#17, #18) | 2 (#34, #35) | 4 |
| PAYWALL-SOFT | 2 (#13, #14) | 2 (#30, #31) | 4 |
| **Total anotável** | 16 | 15 | **31** |
| INVÁLIDO (não anotar) | 1 | 0 | 1 |
| **Total** | | | **36** |

## O que falta (mas não urgente para M2)

- **Likes/comentários do Twitter:** inválido, mas CiteScore pode aceitar "URL de post individual" como Twitter / X com author. **Roadmap, não v1.**
- **YouTube (transcrição):** não é escopo do produto (URL única de artigo web).
- **LinkedIn posts:** mesma situação — não escopo.
- **PDFs / Google Docs:** `long-term-plan.md:42` — fora do escopo v1.

## Como usar esta lista

1. **M2 (Engineer):** pega 10 URLs aleatórias desta lista, processa via `extract-readability.js` (do benchmark) e via pré-filtro + LLM
2. **Anotação manual:** lê o output sentença por sentença, marca qual categoria deveria ser (ground truth)
3. **Comparação:** confere se o classificador automático acertou ≥ 70% das sentenças
4. **Documentação:** se accuracy < 70%, recalibra o pré-filtro e refaz

## Riscos identificados

- **URLs mortas:** algumas dessas URLs podem ter mudado de slug, virado 404, ou mudado de paywall policy. Antes de M2, alguém (Engineer ou você) deve **rodar um ping em todas** e marcar status.
- **Encoding PT-BR:** sites UOL/Globo podem quebrar como no benchmark. O subset aqui tem `g1.globo.com` (#32) que **deve** ser UTF-8; se quebrar, é red flag.
- **Sites institucionais (Sebrae, IBGE):** podem ter proteção anti-bot. Se 403, anota como "blocked, expected" e segue.
- **Twitter #36:** inválido. Pode dar 200 mas com HTML sem `<article>`. Readability vai retornar `null` — exatamente o que queremos testar.
