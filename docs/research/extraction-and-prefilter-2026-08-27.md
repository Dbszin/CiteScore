---
created_at: 2026-08-27
updated_at: 2026-08-27
project_name: citescore
author: opencode (paralelo ao Architect no Claude)
status: input for Architect — não é decisão
---

# Architect Input: Extração, Pré-filtro e Rate Limiting

> Documento de **input** para o Architect tomar decisões. Opções com prós/contras, recomendação marcada. **O Architect decide, não este documento.**

## Origem

Gerado pelo opencode em paralelo à sessão do Architect no Claude, em resposta a três decisões pendentes listadas em `context-resume.md:36` e `progress-checklist.md`:
- estratégia de extração de conteúdo principal
- desenho do pré-filtro determinístico
- mecanismo de rate limiting / budget guard

Pesquisa de 3 subagentes paralelos. Fontes verificadas via webfetch (repos, npm, docs oficiais). Itens não verificados marcados com ⚠️.

---

## 1. Extração de Conteúdo Principal + Segmentação de Sentenças

### Recomendação de stack (1ª escolha)

| Camada | Escolha | Versão | Justificativa |
|---|---|---|---|
| Fetch | `fetch` nativo + `AbortSignal.timeout(8000)` | Node 18+ | Padrão, sem dependência |
| Headers | `Mozilla/5.0 (compatible; CiteScoreBot/1.0)` + `Accept-Language: en-US,en;q=0.9,pt-BR;q=0.8,pt;q=0.7` | — | Boa cidadania de rede |
| Extração | **`@mozilla/readability`** via `jsdom` | 0.6.0 (Mar/2025, ativo) | F1 = 0.947 (top tier OSS), mantido Mozilla |
| Gate | `isProbablyReaderable()` + `charThreshold = 100` | embutido | Aceita artigos SEO curtos |
| Sanitização | `DOMPurify` (só se re-renderizar HTML) | latest | Allowlist de tags/atributos |
| Metadados | JSDOM `querySelector` manual (`og:*`, JSON-LD, `<time>`, `<meta name="author">`) | — | Postlight parser está **abandonado desde Mar/2023** ⚠️ |
| Segmentação | **`sentencex`** (Wikimedia, binding Node de lib Rust) | latest | F1=100 no Golden Rule Set EN, multilíngue (~244 idiomas), rápido, Wikimedia como steward |

### Alternativa (2ª escolha, plano B)

- Microservice Python (FastAPI) chamando **`trafilatura`** (F1=0.958, padrão-ouro acadêmico)
- Custo: cold-start + ~200-500ms latência + segundo runtime
- **Só vale se benchmarks em sites PT-BR mostrarem degradação do readability**

### Erros a tratar explicitamente (camada de UX)

| Cenário | Sinal | Mensagem ao usuário |
|---|---|---|
| Paywall parcial (NYT, Folha) | Texto < 200 palavras + marcadores "Subscribe" / "Assine" / `class*="paywall"` | "Detectamos paywall — apenas N palavras extraídas. Tente outra fonte." |
| JS-heavy / SPA | HTML < 5KB + `<div id="root">` / `__NEXT_DATA__` + ratio texto/tags < 0.05 | "Este site requer JavaScript. Não conseguimos extrair via fetch simples." |
| Conteúdo vazio | Readability `null` ou `textContent.length < 100` | "Não foi possível identificar o artigo principal nesta página." |
| 404/410 | Status code | "Esta página não existe mais (404)." |
| Soft-block (Cloudflare) | 403 + HTML de challenge | "Site protegido contra bots. Tente novamente mais tarde." |
| Timeout | Fetch abortou 8s | "O site demorou demais para responder." |
| 401/403/451 | Status | "Este site bloqueia acesso automatizado. Tente colar o texto manualmente." |

### Padrões da indústria

- Retry 1× em 5xx/timeout. **Sem retry** em 4xx (exceto 408/429).
- Respeitar `robots.txt` como feature, não bloqueio.
- Cache de fetch (ETag/Last-Modified) por 24h.
- Reusar instância JSDOM se virar batch.

### Riscos específicos do CiteScore

- **Sites com muito affiliate/CTA inline:** pós-processamento com lista de bloqueio de classes (`.affiliate, .cta, .promo, [data-affiliate-id]`) antes da segmentação.
- **Artigos < 500 palavras:** baixar `charThreshold` do readability para ~100; UX deve ser honesto sobre baixa densidade.
- **Listas e tabelas no HTML:** preservar como múltiplas sentenças curtas (cada `<li>` vira unidade); tabelas excluir da segmentação, exibir separadamente.
- **PT-BR:** aspas tipográficas (U+201C/U+201D) OK no sentencex; **testar** abreviações brasileiras (Dr., Sra., Exmo., pag., ref., et al.).

### ⚠️ Evitar

- `@postlight/parser` — abandonado desde Mar/2023 (2.2.3, sem updates há 3 anos, 95 issues abertas).
- `unfluff`, `node-readability` (ageitgey) — **repositórios removidos do GitHub**.
- `compromise.sentences()` para PT-BR — cobertura fraca.
- `sbd` — suporte PT-BR é limitado.
- Trafilatura via microservice como escolha default — adicionar latência/cold-start sem ganho claro.

---

## 2. Pré-filtro Determinístico (3 categorias)

### Categorias

- **A** — afirmação com dado/fonte (número, data, unidade, link externo, marcador de citação)
- **B** — afirmação sem fonte (claim factual ambíguo) — **vai pro LLM**
- **C** — opinião (hedge, primeira pessoa, superlativo, deontic)

### Arquitetura em cascata

```
sentença (texto + HTML original)
  │
  ├─► Camada 0: HTML signals  → A imediato
  │     (href externo, <cite>, <sup>[1]</sup>, <time datetime>)
  │
  ├─► Camada 1: regex puro  (seções 2.1, 2.2 abaixo)
  │     ├─► A com confidence=2  → A
  │     ├─► C com confidence=2  → C
  │     └─► Senão / confidence=1 → ambíguo
  │
  ├─► Camada 2 (opcional, só EN): compromise
  │     └─► POS/numbers/money/adjectives
  │
  └─► Camada 3: Claude API  (só nos ambíguos)
```

### 2.1 Regex / sinais fortes de **A**

- **Números absolutos** (EN + PT): `/\d{1,3}(?:[.,]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?(?:\s?[%‰ppm]|R?\$|\s?(?:USD|BRL|EUR))?/iu`
- **Datas** (EN + PT): meses nomeados + ano, `\bQ[1-4]\s?\d{4}\b`, `\b\d{1,2}/\d{1,2}/\d{2,4}\b`, ano isolado
- **Unidades**: `km/h, m/s, kg, g, °C, °F, mm, cm, m, ha, m², m³, USD, BRL, EUR, R$, ¥, €, MW, GW, kWh, ms, s, min, h, GB, MB, KB, TB, Hz`
- **Marcadores de fonte**: EN `according to, as reported by, per [Name], source:, cited by, as [Name] noted` | PT `segundo, conforme, de acordo com, fonte:, apud, citado por`
- **Citação em colchetes/parênteses**: `(IBGE, 2024)`, `[1]`, `(Smith et al., 2020)`
- **Href externo** no HTML original (Camada 0) — **maior sinal de A, verificar antes do strip de tags**

### 2.2 Regex / sinais fortes de **C**

- **Hedge / 1ª pessoa**: EN `I think, I believe, in my opinion, personally, it seems to me` | PT `eu acho, na minha opinião/visão, a meu ver, para mim`
- **Hedge epistêmico**: `talvez, provavelmente, possivelmente, aparentemente, maybe, perhaps, arguably, supposedly`
- **Superlativo sem número**: `the best, the worst, amazing, incredible, fantastic, revolutionary, game-changing` | PT `o melhor, pior, incrível, fantástico, revolucionário`
- **Deontic / recomendação**: EN `should, must, recommend, advise, suggest` | PT `deve, deveria, recomendo, sugiro, aconselho`
- **Adjetivos subjetivos** (Set, ambos idiomas): incrível, fantástico, maravilhoso, perfeito, horrível, amazing, awesome, perfect, terrible, awful, boring, exciting
- **Reporting sem compromiso**: `dizem que, parece que, it is said that, people say, rumor has it`

### 2.3 Sinais **ambíguos** (vão pro LLM)

- Fonte nomeada sem número: "studies show", "pesquisas indicam", "according to researchers"
- Quantificador vago: "twice as many", "very common", "a maioria", "muitos"
- Comparação sem âncora: "more than before", "melhor que o anterior"
- Definição pura: "X é o processo de Y"
- Claim histórico/cultural sem fonte: "Napoleon foi derrotado em 1815"
- Estatística sem ano: "about 60% of users" sem período
- Causa/correlação: "X causes Y"
- Forecast: "will reach 50% by next year"

### 2.4 Trade-off de decisão

**Recomendação: pré-filtro CONSERVADOR** (alta precision, menor recall).
- Falso positivo de C (anotar opinião como fato) = ruído que usuário pode descartar
- Falso positivo de A (perder uma anotação de fonte) = **caro em produto**
- Logo: 2+ sinais = confiar; 1 sinal fraco = LLM; 0 sinais = LLM (default)

### 2.5 Bibliotecas NLP leves (Node)

| Lib | PT-BR | Tamanho | Veredicto |
|---|---|---|---|
| **compromise** (12.1k★) | ❌ sem pack oficial PT | ~250KB | Camada 2 EN-only. `.numbers()`, `.money()`, `.adjectives()` |
| **wink-nlp** (1.4k★) | ❌ só EN | ~10KB gzipped | Mais rápido; EN only |
| **nlp.js** (6.6k★) | ✅ 40 línguas nativas | Pesado | **Único com PT-BR nativo**, mas overkill online; só batch offline |
| **natural** (10.9k★) | ⚠️ stemmers PT parciais | Médio | Sem vantagem específica |

**Recomendação:** regex puro (seções 2.1+2.2) cobre 70-90% dos casos óbvios em <1ms/sentença. compromise só se necessário EN POS. **Não usar NLP online para PT** — overhead injustificável.

### 2.6 Literatura de referência

- **FEVER Workshop (ACL)** — `https://aclanthology.org/venues/fever/` — padrão da indústria para claim detection
- **ArgMining 2021** — Fergadis et al., regras + features lexicais atingem F1=70.0 (Claim), 62.4 (Evidence)
- **ClaimBuster** (Hassan et al. 2017) — listas públicas de features
- **CheckThat! Lab (CLEF 2018-2024)** — track rule-based anual
- **Vasileva et al. 2019** — combina regras + neural para check-worthiness em PT e EN
- ⚠️ Papers originais não verificados nesta sessão; citados pela tradição da área. **Confirmar antes de citar formalmente.**

---

## 3. Rate Limiting & Budget Guard

### Stack recomendada (v1)

| Componente | Escolha | Custo | Por quê |
|---|---|---|---|
| Rate limit | **`@upstash/ratelimit`** (sliding window) | $0 (free tier) | Padrão de fato, Edge-compatible, HTTP-based |
| Storage | Upstash Redis (via Vercel Marketplace — Vercel KV foi descontinuado em Dez/2024) | $0 (500K cmd/mês free) | Único com REST HTTP que funciona em Edge sem TCP |
| Budget guard | Mesmo Upstash Redis, contador com TTL | $0 (≤1 cmd/request) | Lua script atômico para read-modify-write |
| Cap conteúdo | char count no handler, antes do LLM | $0 | Defesa em camadas (HTML bruto, texto extraído, tokens estimados) |
| LLM | Claude **Haiku 4.5** ($1 input / $5 output por MTok) | variável | Custo/qualidade ideal para análise de artigo |
| CAPTCHA | **Nenhum em v1**; Turnstile invisível se necessário na v1.1 | $0 | v1 não justifica; rate limit + budget guard cobrem abuso típico |
| Headers | `X-RateLimit-*` + `Retry-After` + `application/problem+json` | $0 | Compat com clientes existentes + draft IETF |

### Limites iniciais sugeridos

```ts
Ratelimit.slidingWindow(10, "1 m")   // 10 req/min por IP
Ratelimit.slidingWindow(50, "1 h")   // 50 req/hora por IP
budget diário global:  $5/dia   // ≈ 5K artigos médios Haiku
budget horário global: $1/hora
HTML bruto fetch:      cap 2 MB
Texto extraído:        cap 80K chars (≈ 20K tokens, cobre artigo longo)
```

### Degradação graciosa

- Quando rate limit estoura → `429` com `Retry-After: 60` + `application/problem+json` (`type: https://iana.org/assignments/http-problem-types#quota-exceeded`)
- Quando budget diário estoura → `503` com `Retry-After: 3600` + mesma estrutura
- **Modo degradado sem LLM:** fallback heurístico (meta description, headings, contagem de palavras-chave) com `degraded: true, reason: "budget_exceeded"`. Mantém UX viva, custo $0.

### Onde aplicar cada defesa (em ordem)

1. `Content-Length` do body do request → rejeitar > 50KB
2. Fetch do HTML da URL → medir e abortar se > 2MB
3. Após extração (readability) → medir texto extraído, abortar se > 80K chars
4. Antes de chamar Claude → estimar tokens (`chars / 4`), truncar com aviso se passar
5. Medir `usage` da resposta → somar no contador de budget
6. Próxima request → checar budget antes de chamar Claude

### Cache e mitigação de custo se viralizar

- **Cache de resultado por URL hasheada** (Redis, TTL 24h) — corta 50-90% das chamadas
- **Prompt caching do Claude** (1.25× write, 0.1× read, TTL 5min grátis) — colocar system prompt em cache
- **Fallback degradado** quando budget estoura — UX viva, $0

### ⚠️ Evitar

- `next-limit` — deprecado pelo autor, substituído por `@ratelock/redis` e `@ratelock/local` ⚠️
- `next-rate-limit` — npm bloqueada, ecossistema estagnado ⚠️
- `next-safe-action` — **não é rate limiter**, é framework de server actions tipadas ❌
- In-memory Map em Edge — state não compartilhado entre instâncias serverless
- CAPTCHA em v1 — exagero até ver abuso real nos logs

### Headers HTTP

- `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` (padrão de fato, GitHub/Twitter)
- `RateLimit-Policy`, `RateLimit` (draft IETF `https://datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/`)
- `Retry-After` (segundos ou data HTTP) — obrigatório em 429/503
- `Content-Type: application/problem+json` no body

---

## 4. Estimativa de Custo Mensal

| Cenário | Upstash | Claude Haiku 4.5 | Total |
|---|---|---|---|
| **Baixo** (≤100 req/dia, ~10K tok in + 1K out) | $0 | <$1 | **≈ $1/mês** |
| **Médio** (1K req/dia) | ~$0,10 | ~$15 | **≈ $15/mês** |
| **Pico viral** (50K req/dia) | ~$5 (pay-as-you-go) | ~$750 | **≈ $755/mês** ← ativa pay-as-you-go + CAPTCHA + cache agressivo |

---

## 5. Decisões que o **Architect** precisa tomar (este documento só sugere)

1. **Framework de UI** (provável Tailwind + shadcn/ui, não decidido) — fora do escopo desta pesquisa
2. **Provider de deploy** (Vercel é default, não confirmado) — afeta onde Upstash roda
3. **Confirmação do LLM como Claude API** (registrado no brief, não contestado) — afeta Haiku vs Sonnet vs Opus
4. **Onde fica a `Content-Length` check** — middleware.ts ou route handler?
5. **Estrutura de `specs/changes/`** — uma spec monolítica ou uma por milestone (M1/M2/M3/M4)?
6. **Se aceita `charThreshold = 100` no readability** vs default 500 — afeta UX em artigos SEO curtos
7. **Modelo de cache** — Redis com TTL 24h por URL hasheada, ou só ETag/Last-Modified no fetch?
8. **Onde entra o cap de 80K chars** — antes ou depois do pré-filtro? Antes é mais barato, depois é mais preciso.
9. **Se a UI mostra o modo degradado** como "análise parcial" ou esconde e retorna erro

---

## 6. Notas de verificação

✅ Verificado via webfetch: `@mozilla/readability` (github.com/mozilla/readability), `@extractus/article-extractor`, `sentencex` (github.com/wikimedia/sentencex), `compromise`, `nlp.js`, `wink-nlp`, `retext`, `natural`, `trafilatura`, `@upstash/ratelimit`, `upstash/pricing`, `anthropic/pricing`, `datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/`, Vercel KV deprecation note, FEVER venue, ArgMining 2021.

⚠️ NÃO verificado nesta sessão: papers ClaimBuster, Konstantinovskiy, CheckThat! (citei pela tradição da área), `franc` e `cheerio` (mencionados como sugestão), `linkedom` (alternativa leve ao jsdom), preço exato Haiku 4.5 em ago/2026 (verificar pricing page direto).

Itens marcados com ⚠️ na tabela original foram sinalizados pelos subagentes; este documento mantém a marcação para o Architect validar.
