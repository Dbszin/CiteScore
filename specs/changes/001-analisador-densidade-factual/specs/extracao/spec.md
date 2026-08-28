# Spec Delta: Extração de Conteúdo

## Current State

Nada. Repositório vazio.

## Changes

### ADDED

- **Porta `ContentFetcher`** — busca o HTML de uma URL pública.
- **Porta `ContentExtractor`** — extrai o conteúdo principal e detecta o idioma.
- **`HttpContentFetcher`** — implementação com todas as defesas de SSRF listadas em `design.md` § Security.
- **`ReadabilityExtractor`** — `@mozilla/readability` sobre `linkedom`. `linkedom` em vez de `jsdom` por ser mais leve e adequado a ambiente serverless.
- **Detecção de idioma** — `<html lang>` como sinal primário; heurística de stopwords como fallback quando o atributo está ausente ou mente.
- **Coleta de domínios externos** — os domínios linkados no conteúdo, usados como sinal pró-fonte pelo pré-filtro.
- **`FixtureFetcher` / `FixtureExtractor`** — adapters de teste que leem de `tests/fixtures/html/`, para que a calibração rode sem rede.

### Tipos de página suportados no v1

**Suportado:** artigo, post de blog e página editorial com conteúdo principal presente no HTML servido.

**Não suportado, com erro explícito:**

| Caso | Código |
|---|---|
| Conteúdo atrás de paywall | `NO_MAIN_CONTENT` |
| Conteúdo renderizado por JavaScript no cliente | `NO_MAIN_CONTENT` |
| Home, listagem, categoria (sem artigo único) | `NO_MAIN_CONTENT` |
| PDF, imagem, JSON, XML | `NOT_HTML` |
| Idioma fora de PT-BR e EN | `UNSUPPORTED_LANGUAGE` |

Não suportar é uma decisão de escopo, não uma falha. O que **é** falha é não dizer ao usuário qual dos casos ocorreu — daí um código por modo de falha, em vez de um erro genérico.

Renderização de JavaScript (headless browser) fica fora do v1: multiplicaria custo, latência e superfície de ataque para atender um subconjunto de páginas.

## Migration Notes

Não aplicável — projeto novo.

## Backward Compatibility

Não aplicável — nada existe.

## Acceptance Criteria

- [ ] Artigo público em PT-BR com HTML servido: texto principal extraído, menu, rodapé, sidebar e bloco de comentários removidos.
- [ ] Cada modo de falha da tabela retorna seu código específico, verificado por teste com fixture.
- [ ] URL apontando para `localhost`, `127.0.0.1`, `10.x`, `192.168.x` ou `169.254.169.254` é rejeitada com `BLOCKED_HOST`.
- [ ] Redirect que aponta para IP privado é rejeitado **após** o redirect — teste explícito para o bypass.
- [ ] Cap de bytes interrompe o download **durante** o stream; página maior que o cap não é baixada inteira.
- [ ] Idioma detectado corretamente em artigo PT-BR e EN, incluindo caso sem `<html lang>`.
- [ ] `externalDomains` traz apenas domínios diferentes do domínio analisado.
