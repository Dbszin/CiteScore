---
created_at: 2026-08-27
updated_at: 2026-08-28
project_name: citescore
---

# Context Resume: CiteScore

> Leia este arquivo primeiro ao retomar o projeto. Ele reflete o estado atual, não o histórico — para o histórico, veja `session-log.md`.

## Project Summary

CiteScore é um web app de análise de conteúdo para SEO. O usuário informa a URL de um artigo e o sistema extrai o conteúdo principal, segmenta em sentenças e classifica cada uma em três categorias: afirmação com dado/fonte, afirmação sem fonte, ou opinião. A partir dessa distribuição calcula um **score de densidade factual**, apresentado como **estimativa** de quão citável o conteúdo é por motores de AI — e não como citação medida. O relatório entrega o score, o breakdown por categoria, o texto destacado sentença por sentença e sugestões de reescrita. O v1 é análise avulsa: sem login, sem banco, sem histórico.

## Current Phase

**M2 parcial, DESBLOQUEADO.** O projeto tem código funcionando, testado e publicado, e a chave da API chegou ao fim da sessão de 2026-08-28.

- **Publicado:** commit `7d69fa7` em `origin/main`, 118 arquivos, 18.194 inserções.
- **M1 completo**, gate verificado: build passa, `npm run dev` responde, e a regra de pureza do core tem teste que a exercita.
- **M2 parcial:** extração, segmentação, scoring e pré-filtro de regras estão prontos e testados. Falta o classificador LLM, o caso de uso, o container e a rota HTTP.
- **297 testes** passando; 282 rodam em clone limpo.
- **Duas rodadas de revisão** concluídas, veredito final PASS.
- **M3 (UI) e M4 (hardening/deploy)** não começaram.

## 🔑 Estado da configuração

**`ANTHROPIC_API_KEY` presente** em `.env.local` (arquivo ignorado pelo git).
**Modelo escolhido: `claude-haiku-4-5`** — responde OQ-1 pelo tier mais barato, ~US$0,026 por análise, 5x abaixo de `claude-opus-5`. O default do código segue `claude-opus-5`; a escolha vive em `.env.local`, o ponto único previsto pela ADR-005.

O caminho está livre para: `ClaudeClassifier` → `HybridClassifier` → `analyze-url` → container → rota → **calibração**, que é o acceptance criteria de M2.

### ⚠️ Pendência de segurança herdada

A chave foi inicialmente colada em `.env.example`, que é **versionado**. Foi movida para `.env.local` e o template restaurado antes de qualquer commit — **a chave nunca chegou ao GitHub** (verificado em `git show HEAD:.env.example`).

Ainda assim: **rotacione a chave por precaução.** Ela transitou por um arquivo versionado num repositório público e apareceu em texto plano no transcrito da sessão. Nada indica vazamento; rotacionar é barato e a alternativa é confiar que nada deu errado.

## Open Questions

**Decisões do usuário:**

- ~~**OQ-1 — tier do modelo.**~~ **RESPONDIDA em 2026-08-28: `claude-haiku-4-5`.** Fica um alerta honesto: descer de tier troca dinheiro por qualidade de classificação, e qualidade de classificação é o ativo do produto. A calibração de M2 vai mostrar se o haiku sustenta a nuance que os casos ambíguos exigem — se não sustentar, subir de tier é uma variável de ambiente.
- **OQ-2 — dependência de Upstash Redis** para rate limit e budget guard em M4. Rate limit em memória **não funciona** em serverless: cada invocação tem memória própria, então o contador não é compartilhado. Daria sensação de proteção sem proteção.

**Dívidas técnicas conhecidas, em ordem de urgência:**

1. **Teste de meta-cobertura das tabelas de sinais é inerte.** Foi anunciado como proteção contra sinal novo sem teste, mas foi provado por injeção que não falha. Importa porque foi a resposta a três bugs consecutivos no mesmo arquivo. Corrigir antes de M2 fechar.
2. **Desqualificador de atribuição tem escopo de sentença, não de ocorrência.** Anula atribuição legítima quando ela coexiste com um ordinal — `"Dados do IBGE mostram que no Segundo Trimestre…"` escala em vez de decidir. Falso negativo na direção segura, mas custa escalonamento ao LLM em conteúdo econômico/trimestral, que é comum no domínio-alvo.
3. **TOCTOU / DNS rebinding no `HttpContentFetcher`** — `assertPublicHost` resolve o hostname e depois `fetch()` resolve de novo. Exige fixar o IP resolvido via conector próprio do `undici`. **Bloqueador do deploy de M4.**
4. **`.gitattributes`** marcando `tests/fixtures/html-min/pt-latin1.html` como binário. O arquivo é cp1252 e depende de fidelidade de bytes; o Git no Windows aplicou normalização de fim de linha nele.
5. **Débito de spec: 21 itens** no topo de `specs/changes/001-analisador-densidade-factual/tasks.md` — decisões que existem no código mas não nas ADRs. Débito aceito conscientemente ao optar por corrigir no código em vez de revisar a spec primeiro.

## O que já foi decidido — não re-litigar

Estas decisões têm ADR escrita com justificativa. Revisitar exige motivo novo, não preferência:

| Decisão | Onde | Por quê, em uma linha |
|---|---|---|
| Arquitetura hexagonal | ADR-001 | Viabiliza a calibração de M2 sem rede e sem gastar com LLM |
| Motor híbrido, `UNSOURCED` nunca por regra | ADR-002 | Erro de regra não passa por revisão; é pior que erro do LLM |
| Fórmula do score | ADR-003 | Opinião dilui mas não penaliza; ausência de score é estado próprio |
| Honestidade como contrato de API | ADR-004 | Ressalva que vive só na UI morre no primeiro redesign |
| `claude-opus-5` como default | ADR-005 | A saída domina 92% do custo — caching rende só ~10% |
| linkedom em vez de jsdom | medição | 3,6x mais rápido, 2,3x menor, saída equivalente em 6/7 fixtures |
| `links/palavra` descartado como sinal | medição | Wikipedia (legítima) tem o dobro da densidade da home da Folha |
| Texto de `article.content`, não `textContent` | medição | `textContent` gruda sentenças e o `Intl.Segmenter` não quebra |

## Next Actions

1. **Rotacionar a chave da API** por precaução (ver pendência de segurança acima).
2. **Responder OQ-2** (Redis para M4) — não bloqueia M2.
3. **Engineer:** implementar `ClaudeClassifier` e `HybridClassifier`, depois `analyze-url`, container e rota HTTP.
4. **Engineer:** corrigir o teste de meta-cobertura inerte e criar o `.gitattributes`.
5. **Calibrar** com `claude-haiku-4-5`, usando `docs/research/golden-dataset-candidates-2026-08-27.md`, que já traz a lista curada de URLs. Registrar custo real por análise e a taxa de escalonamento (meta ≤50%).
6. **Revisitar os pesos 0,6 / 0,4** da ADR-003 à luz da calibração — são ponto de partida, não resultado.
7. **Só depois:** Designer para M3, e o TOCTOU antes de qualquer deploy em M4.

## Contexto externo

`docs/research/` contém três documentos gerados pela ferramenta `opencode` em paralelo a esta sessão (autoria declarada no frontmatter de cada um):

- `extraction-and-prefilter-2026-08-27.md` — input de pesquisa que embasou decisões do Architect.
- `extraction-benchmark-2026-08-27.md` — o benchmark que originou quatro correções. Já anotava *"⚠️ encoding quebrado (Folha)"*, convergindo com o que a revisão encontrou depois, de forma independente.
- `golden-dataset-candidates-2026-08-27.md` — **lista curada de URLs para a validação manual de M2.** Pronta para uso.
