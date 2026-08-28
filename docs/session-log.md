---
created_at: 2026-08-27
updated_at: 2026-08-28
project_name: citescore
---

# Session Log: CiteScore

Entradas novas são adicionadas no topo de `## Sessions`. Nunca sobrescrever entradas antigas.

## Sessions

### 2026-08-28 — Incidente de segredo + desbloqueio de M2

- **Focus:** ao fim da sessão, ao atualizar os artefatos de longo prazo, foi
  detectada uma chave de API real em arquivo versionado.

- **O que aconteceu:**
  - Uma `ANTHROPIC_API_KEY` real foi colada em `.env.example` — o arquivo
    **template, versionado**. O arquivo correto seria `.env.local`, que está
    no `.gitignore`. Junto veio a troca de `ANTHROPIC_MODEL` para
    `claude-haiku-4-5`.
  - **A chave NÃO foi comitada nem publicada.** Verificado com
    `git show HEAD:.env.example`: o commit `7d69fa7` tem o campo vazio. A
    exposição ficou restrita ao working tree local.
  - O risco era concreto e iminente: o repositório é **público**, e o passo
    seguinte previsto era o Shipper comitar os artefatos atualizados — o que
    levaria a chave junto. Bots varrem o GitHub por padrões `sk-ant-` em
    segundos.

- **Ação tomada:**
  - `.env.local` criado com os valores reais (arquivo ignorado pelo git).
  - `.env.example` restaurado ao template sem valores, byte a byte idêntico
    ao commit publicado.
  - Confirmado que `git status` não lista mais `.env.example`.

- **Pendência que fica:**
  - **Rotacionar a chave por precaução.** Ela transitou por um arquivo
    versionado e apareceu em texto plano no transcrito da sessão, ao ser
    investigada. Nada indica vazamento, mas rotacionar é barato e a
    alternativa é confiar que nada deu errado.

- **Decisão de produto embutida no incidente:**
  - **OQ-1 respondida: `claude-haiku-4-5`.** ~US$0,026 por análise, 5x mais
    barato que `claude-opus-5`. O default do código segue `claude-opus-5`; a
    escolha vive em `.env.local`, que é o ponto único previsto pela ADR-005.
  - **M2 está desbloqueado.** O classificador LLM e a calibração podem
    começar.

### 2026-08-28 — M1 completo, M2 parcial, primeiro commit publicado

- **Focus:** executar o ciclo CrewLoop completo a partir das especificacoes:
  Architect escreve as specs, Engineer implementa, Reviewer audita, Shipper
  publica. Sessao iniciada em 2026-08-27 e concluida em 2026-08-28.

- **Key decisions:**
  - **Arquitetura hexagonal (ADR-001)** — escolhida porque o marco de maior
    risco (M2) exige centenas de execucoes sobre corpus real; sem portas,
    cada execucao custaria rede e dinheiro. A arquitetura existe para
    viabilizar a calibracao, nao por preferencia estetica.
  - **Motor hibrido (ADR-002)** — o pre-filtro decide apenas dois casos de
    alta confianca. `UNSOURCED` NUNCA e decidido por regra, porque e a
    categoria acionavel do produto: errar nela e errar no que o usuario vai
    ler e agir. Meta de escalonamento ao LLM: <= 50%.
  - **Formula do score criada de zero (ADR-003)** — ela nao existia antes
    desta sessao. `CiteScore = round(100 * (0,6 * FD + 0,4 * (1 - GAP)))`,
    com `FD = sourced/N` e `GAP = unsourced/(sourced+unsourced)`. Opiniao
    DILUI a densidade mas nao penaliza, para nao empurrar o usuario a
    produzir texto sem voz. Ausencia de score e estado proprio, nao zero.
  - **Honestidade do score virou CONTRATO (ADR-004)** — `disclaimer`,
    `scoreVersion` e `methodology` sao campos obrigatorios do payload, com
    teste que falha se ausentes. Ressalva que vive so na UI morre no
    primeiro redesign, e o produto passa a afirmar algo que nunca mediu sem
    ninguem ter decidido mentir.
  - **Modelo `claude-opus-5`, ~US$0,13 por analise (ADR-005)** — e a
    descoberta contra-intuitiva: a SAIDA domina 92% do custo, entao prompt
    caching, primeiro reflexo de quem otimiza LLM, rende aqui apenas ~10%.
    Os levers que movem o numero sao todos do lado da saida.
  - **linkedom adotado contra jsdom, por medicao** — 3,6x mais rapido
    (85ms vs 304ms por pagina), 2,3x menor em disco, saida equivalente em
    6 de 7 fixtures. A primeira medicao deu 7/7 FALHAS, mas investigar
    antes de concluir revelou bug do proprio codigo (`parseHTML` num
    fragmento deixa `body` vazio), nao limitacao da biblioteca.
  - **`links/palavra` DESCARTADO como sinal** — os dados contradisseram a
    hipotese: a Wikipedia, conteudo legitimo e o mais denso em fonte do
    corpus, tem 0,316, quase o DOBRO da home da Folha (0,172). O sinal
    produziria falso positivo justo nas paginas que o produto quer premiar.
    Criterio final: razao de sentencas analisaveis < 0,35, calibrado em 7
    paginas reais.
  - **Texto derivado de `article.content`, nunca de `article.textContent`**
    — o Readability concatena blocos sem separador ("visitors.Every") e o
    `Intl.Segmenter` nao quebra isso, propagando o erro em silencio para
    classificacao, score e highlight.
  - **Charset declarado passou a ser respeitado** — site PT-BR em latin-1
    gerava mojibake, corrompendo exatamente as tabelas de sinais
    acentuadas. O mercado primario e brasileiro.

- **Outcomes:**
  - **Primeiro commit do projeto publicado:** `7d69fa7` em `origin/main`,
    118 arquivos, 18.194 insercoes. O repositorio saiu de zero commits.
  - **M1 completo**, gate verificado: build passa, `npm run dev` responde
    HTTP 200, e a regra de pureza do core tem teste que a EXERCITA em vez
    de assumir que funciona.
  - **M2 parcial:** extracao, segmentacao, scoring e pre-filtro de regras.
  - **297 testes**, 282 dos quais rodam em clone limpo.
  - **Duas rodadas de revisao.** A primeira encontrou 2 criticos e 2 altos;
    a segunda aprovou com 2 achados menores.
  - **Cinco bugs achados por TESTE, nenhum por leitura:**
    (a) o `\b` no fim do padrao de quantidade nunca casa depois de `%`, o
    que tornava percentual — o sinal de fonte mais comum em SEO —
    invisivel; (b) padrao de atribuicao sem flag de caixa, entao "Segundo o
    IBGE" no inicio de frase nao casava; (c) `\d{1,3}` exigindo separador
    de milhar, entao "1200%" nao casava; (d) FALSO POSITIVO CONFIANTE — "No
    Segundo Trimestre de 2024" era `SOURCED` por regra, confianca 0,92, sem
    fonte alguma; (e) a propria suite reportava verde em clone limpo com 16
    testes silenciosamente ignorados.
  - Tres bugs consecutivos no mesmo arquivo deixaram de ser azar e viraram
    sinal: as tabelas de sinais ganharam bateria sistematica de 76 casos.

- **Next steps:**
  - **Desbloquear `ANTHROPIC_API_KEY`** — sem ela nao ha classificador LLM
    e portanto nao ha calibracao, que e o acceptance criteria de M2.
  - Decidir **OQ-1** (tier do modelo, fator 5x de custo) e **OQ-2**
    (dependencia de Redis para M4).
  - Corrigir o **teste de meta-cobertura inerte** antes de M2 fechar.
  - Usar `docs/research/golden-dataset-candidates-2026-08-27.md`, que ja
    tras a lista curada de URLs para a validacao manual.
  - Comitar estes artefatos atualizados (Shipper).

### 2026-08-27 — Discovery inicial e definição de escopo do v1

- **Focus:** Primeira sessão do projeto. Repo vazio (zero commits). Transformar a ideia "Content Factual Density Analyzer" em escopo de v1 rastreável.

- **Key decisions:**
  - **Citabilidade em AI = score heurístico (proxy), não medição real.** Decisão consciente após confronto explícito das duas alternativas. Medição real em ChatGPT/Perplexity/AI Overviews fica no roadmap. Consequência: a UI é obrigada a rotular o score como estimativa.
  - **Usuário primário do v1:** marketer / SEO in-house analisando o conteúdo do próprio site.
  - **Entrada apenas por URL única.** Texto colado, upload de arquivo e análise em lote ficam fora do v1.
  - **Motor híbrido:** pré-filtro determinístico (números, datas, unidades, links de fonte, hedging) + LLM nos casos ambíguos. Escolhido em vez de LLM puro (custo) e de regras puras (raso demais).
  - **Sem login, sem banco, sem histórico.** Análise avulsa para chegar ao ar rápido e validar demanda.
  - **Output completo:** score + breakdown por categoria + highlight inline por sentença + sugestões de melhoria por sentença.
  - **Stack:** Next.js + TypeScript. LLM assumido como Claude API (assunção registrada, não contestada pelo usuário).
  - **Ritmo:** multi-sessão, com prazo "o quanto antes" — datas-alvo agressivas de ~3 semanas.
  - **Marcos com risco primeiro:** o motor de análise (M2) vem antes da UI, para que a falha do classificador seja descoberta na primeira semana e não na quarta.

- **Outcomes:**
  - Brief de escopo aprovado pelo CrewLoop Hub após 3 rodadas de discovery (11 decisões capturadas).
  - Dois riscos levantados e registrados para a arquitetura resolver: abuso/custo de LLM em endpoint público sem auth, e honestidade da afirmação de correlação com citabilidade.
  - Criados os quatro artefatos de acompanhamento multi-sessão em `docs/`.
  - Nenhum código escrito. Nenhum commit feito.

- **Next steps:**
  - Architect escreve as specs em `specs/changes/` — obrigatório antes de qualquer código.
  - Architect decide: framework de UI, estratégia de extração de conteúdo, desenho do pré-filtro determinístico, provider de deploy, e o mecanismo de rate limiting / budget guard.
  - Depois das specs: Designer para a direção visual do relatório (inclui a copy de honestidade do score).
  - Shipper deve comitar `docs/` junto com o primeiro commit do projeto.
