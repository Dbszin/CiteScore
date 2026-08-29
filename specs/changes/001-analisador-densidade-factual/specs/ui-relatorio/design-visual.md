# Direção visual: CiteScore

> Este documento define **como a tela parece e se comporta**. Os requisitos que
> ela precisa garantir estão em [`spec.md`](spec.md), e as restrições de
> contrato vêm da [ADR-004](../../../../decisions/004-honestidade-como-contrato.md)
> e da emenda da [ADR-007](../../../../decisions/007-escala-do-score.md).

---

## 1. Enquadramento

**Problema.** Um profissional de SEO precisa saber quais afirmações do próprio
texto estão penduradas sem fonte — e precisa saber *quais*, não *quantas*. Uma
nota agregada não diz onde reescrever.

**Público.** Marketer in-house, entre a redação e a publicação. Chega com um
artigo pronto e uma dúvida específica: *isto está sustentado o bastante?* Não é
analista de dados; é editor.

**A ideia que decide tudo.** O produto foi medido e não consegue produzir uma
nota confiável — a régua é comprimida e uma em seis execuções diverge oito
pontos. Isso parece limitação, e não é: **o valor sempre esteve no texto
anotado, não no número.** Um revisor não devolve um manuscrito com nota 7; ele
devolve o manuscrito marcado.

**A solução.** A tela é um **manuscrito revisado**, não um painel. O artigo do
usuário ocupa o centro, marcado sentença a sentença como uma prova tipográfica.
As proporções são a leitura do revisor. O composto vira nota de rodapé técnica —
onde uma medição incerta pertence.

---

## 2. Direção estética: prova tipográfica

Editorial de instrumento — a estética de uma prova de revisão anotada, não de
um dashboard. Papel levemente quente, tinta escura, três marcas de anotação com
traço distinto. A autoridade vem da tipografia e do espaço, não de cartões
flutuando com sombra.

O efeito buscado é **credibilidade sóbria**: alguém leu o seu texto com cuidado
e marcou o que precisa de atenção. Não celebração, não reprovação.

Isso também resolve, por construção, o que a ADR-007 proíbe. Uma prova de
revisão não tem nota, medalha nem semáforo — a metáfora torna a tentação
impossível.

**O que esta direção rejeita explicitamente:** cartões com sombra difusa e
gradiente violeta, medidores circulares, ícones de troféu, grid simétrico de
três colunas, e o número grande centralizado que é a assinatura de todo produto
de "score".

---

## 3. Sistema de cor

Valores em HSL. Derivados para este produto: papel quente em vez de branco puro,
tinta azulada em vez de preto, e três marcas de anotação **sem valência** —
nenhuma delas pode ler como aprovação ou reprovação.

### Base

| Token | Claro | Escuro | Uso |
|---|---|---|---|
| `--bg-primary` | `hsl(40 22% 97%)` | `hsl(222 16% 11%)` | Fundo da página |
| `--bg-surface` | `hsl(42 30% 99%)` | `hsl(222 14% 15%)` | Cartões, o painel do manuscrito |
| `--bg-elevated` | `hsl(42 30% 100%)` | `hsl(222 13% 19%)` | Popover de sentença |
| `--bg-sunken` | `hsl(40 18% 94%)` | `hsl(222 18% 9%)` | Ficha técnica, áreas recuadas |
| `--text-primary` | `hsl(222 20% 14%)` | `hsl(40 18% 92%)` | Títulos e o texto analisado |
| `--text-secondary` | `hsl(222 12% 36%)` | `hsl(40 10% 68%)` | Apoio, rótulos |
| `--text-muted` | `hsl(222 9% 44%)` | `hsl(40 8% 53%)` | Meta, sentenças fora da análise |
| `--accent` | `hsl(224 58% 42%)` | `hsl(224 70% 68%)` | Ação primária, links, foco |
| `--accent-contrast` | `hsl(42 30% 99%)` | `hsl(222 20% 12%)` | Texto sobre `--accent` |
| `--border` | `hsl(38 16% 85%)` | `hsl(222 12% 26%)` | Divisores, contornos |
| `--border-strong` | `hsl(38 14% 72%)` | `hsl(222 10% 38%)` | Contorno do manuscrito |
| `--focus` | `hsl(224 80% 52%)` | `hsl(224 90% 70%)` | Anel de foco |
| `--error` | `hsl(4 62% 44%)` | `hsl(4 72% 68%)` | Falhas de operação |
| `--notice` | `hsl(38 58% 38%)` | `hsl(38 70% 62%)` | Avisos (truncagem, degradação) |

### As três categorias

Escolhidas para serem **descritivas, não avaliativas**. Sem verde/amarelo/
vermelho: semáforo comunicaria aprovação, que é exatamente o que a ADR-007
proíbe. São três lápis de revisor, de pesos iguais.

| Categoria | Tinta (claro) | Tinta (escuro) | Fundo (claro) | Fundo (escuro) |
|---|---|---|---|---|
| Com dado ou fonte | `hsl(186 62% 26%)` | `hsl(186 58% 62%)` | `hsl(186 44% 92%)` | `hsl(186 40% 18%)` |
| Sem fonte | `hsl(250 46% 46%)` | `hsl(250 68% 74%)` | `hsl(250 42% 94%)` | `hsl(250 34% 22%)` |
| Opinião | `hsl(32 66% 34%)` | `hsl(32 72% 62%)` | `hsl(32 52% 92%)` | `hsl(32 42% 19%)` |

**Contraste CALCULADO** (tinta sobre o fundo da própria categoria, modo claro):
teal **5,97:1** · índigo **6,60:1** · ocre **4,86:1**. Todos acima de 4,5:1
para corpo.

> Correção de 2026-08-29: esta linha afirmava 7,1 / 6,4 / 6,8, números que
> nunca foram calculados — o ocre estava 28% acima do real e é o mais próximo
> do limiar. O cálculo agora é um teste (`tests/adapters/ui/contraste.test.ts`),
> que lê os tokens do CSS e recalcula. Ele achou de imediato duas reprovações
> que a conferência manual não viu: `--text-muted` a 3,49:1 sobre a ficha
> técnica no tema claro, e a 4,40:1 sobre o manuscrito no escuro. Ambas
> corrigidas.
>
> A lição é a mesma da emenda da ADR-007: contraste escrito à mão é opinião;
> o cálculo é determinístico e barato, e não havia razão para não fazê-lo.

### Cor nunca é o único canal

Requisito de acessibilidade, e o brief apontou isso como falha real da versão
atual. Cada categoria tem **traço próprio** no sublinhado:

| Categoria | Traço | Leitura sem cor |
|---|---|---|
| Com dado ou fonte | `border-bottom: 2px solid` | Linha cheia — "ancorado" |
| Sem fonte | `border-bottom: 2px dashed` | Tracejado — "pendente" |
| Opinião | `border-bottom: 2px dotted` | Pontilhado — "voz do autor" |

Três estilos de linha distinguíveis em escala de cinza, em qualquer deficiência
de visão de cor, e em impressão preto e branco. A cor é reforço; o traço é a
informação.

---

## 4. Tipografia

**Família: IBM Plex.** Três cortes de uma família só — Sans para interface,
Serif para o manuscrito, Mono para números e metadados.

**Custo: zero dependências novas.** `next/font/google` já vem no Next 15,
auto-hospeda os arquivos, elimina requisição a terceiros e não causa CLS. Não
há pacote a instalar.

**Por que Plex e não Inter:** foi desenhada para documentação técnica, tem corte
serifado de verdade — essencial para a metáfora do manuscrito — e não é a fonte
padrão de todo SaaS. Carregar apenas os pesos listados abaixo.

| Nível | Fonte | Tamanho | Entrelinha | Tracking | Peso | Uso |
|---|---|---|---|---|---|---|
| H1 | Plex Sans | `1.75rem` / 28px | `1.2` | `-0.02em` | 600 | Nome do produto |
| H2 | Plex Sans | `1.25rem` / 20px | `1.3` | `-0.01em` | 600 | Títulos de seção |
| H3 | Plex Sans | `0.9375rem` / 15px | `1.4` | `0.01em` | 600 | Rótulos de cartão |
| **Manuscrito** | **Plex Serif** | **`1.0625rem` / 17px** | **`1.75`** | **`0`** | **400** | **O texto analisado** |
| Corpo | Plex Sans | `0.9375rem` / 15px | `1.6` | `0` | 400 | Parágrafos de interface |
| Corpo-sm | Plex Sans | `0.8125rem` / 13px | `1.5` | `0` | 400 | Ressalva, legendas |
| Rótulo | Plex Sans | `0.75rem` / 12px | `1.3` | `0.06em` | 600 | Rótulos em caixa alta |
| Dado | Plex Mono | `1.5rem` / 24px | `1.1` | `-0.01em` | 500 | Os percentuais do breakdown |
| Meta | Plex Mono | `0.75rem` / 12px | `1.5` | `0` | 400 | Ficha técnica |
| Botão | Plex Sans | `0.9375rem` / 15px | `1` | `0.01em` | 600 | Ações |

A entrelinha de `1.75` no manuscrito não é estética: o sublinhado de anotação
precisa de ar para não colidir com a linha seguinte.

---

## 5. Tokens

### Espaço — base 4px

`--space-1: 4px` · `--space-2: 8px` · `--space-3: 12px` · `--space-4: 16px` ·
`--space-6: 24px` · `--space-8: 32px` · `--space-12: 48px` · `--space-16: 64px`

### Raio

`--radius-sm: 3px` (marcas, tags) · `--radius-md: 6px` (campos, botões) ·
`--radius-lg: 10px` (cartões) · `--radius-full: 9999px` (pílulas de legenda)

Raios contidos: papel e prova não têm cantos muito arredondados.

### Elevação

Esta direção usa **contorno, não sombra**. Sombra difusa é a assinatura visual
que estamos rejeitando.

| Token | Valor | Uso |
|---|---|---|
| `--elev-0` | `none` | Padrão de tudo |
| `--elev-line` | `0 0 0 1px var(--border)` | Cartões e o manuscrito |
| `--elev-line-strong` | `0 0 0 1px var(--border-strong)` | Painel do manuscrito |
| `--elev-pop` | `0 4px 16px hsl(222 20% 14% / 0.10)` | Popover de sentença — o único |

### Largura

`--measure: 68ch` para o manuscrito (medida de leitura). Container geral
`--container: 60rem` / 960px.

---

## 6. Estrutura da tela

### Desktop ≥1024px

```
┌──────────────────────────────────────────────────────────────┐
│  CiteScore                                    [metodologia →]│  H1 + link
│  Quanto do seu artigo está sustentado por fonte.             │  corpo-sm
├──────────────────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ COMO LER ESTE RESULTADO                                  │ │  rótulo
│ │ Este score mede densidade factual — a proporção de …     │ │  DISCLAIMER_PT_BR
│ │ Não consultamos ChatGPT, Perplexity ou AI Overviews.     │ │  do domínio
│ └──────────────────────────────────────────────────────────┘ │  borda-esq 3px accent
│                                                              │
│  [ https://exemplo.com/artigo            ]  [  Analisar  ]   │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  A LEITURA                                            ← H2   │
│  ┌────────────────┬────────────────┬────────────────┐        │
│  │ ▁▁▁ 12%        │ ┄┄┄ 69%        │ ⋯⋯⋯ 19%        │        │  dado (mono 24px)
│  │ Com dado       │ Sem fonte      │ Opinião        │        │  rótulo
│  │ ou fonte       │                │                │        │
│  │ 12 de 100      │ 69 de 100      │ 19 de 100      │        │  meta
│  └────────────────┴────────────────┴────────────────┘        │
│  ▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░▒▒▒▒▒▒▒       │  barra proporcional
│                                                              │
│  Das 81 afirmações do texto, 69 não citam fonte.      ← H3   │  frase-síntese
│                                                              │
├──────────────────────────────────────────────────────────────┤
│  O TEXTO                                              ← H2   │
│  ▁▁ com fonte   ┄┄ sem fonte   ⋯⋯ opinião   ░ fora da análise│  legenda
│  ┌──────────────────────────────────────────────────────────┐│
│  │  SEO stands for search engine optimization.              ││  Plex Serif 17px
│  │  ▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁              ││  entrelinha 1.75
│  │  It is the practice of improving your website's content, ││  medida 68ch
│  │  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄      ││
│  │  SEO is essential for beginners and businesses.          ││
│  │  ⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯          ││
│  └──────────────────────────────────────────────────────────┘│
├──────────────────────────────────────────────────────────────┤
│  ficha técnica                                               │  bg-sunken, mono 12px
│  artigo  What Is SEO? · en · 175 sentenças, 100 analisadas   │
│  medição  densidade factual 12% · composto 13 · score v1.0.0 │  ← o número mora AQUI
│  execução 10,7 s · claude-haiku-4-5                          │
└──────────────────────────────────────────────────────────────┘
```

### O composto: onde e por quê

Ele aparece **uma vez**, na ficha técnica, em Plex Mono 12px, cor
`--text-muted`, como um campo entre outros — ao lado da versão do score e do
modelo. Sem destaque, sem `/100` grande, sem barra.

Isso satisfaz a ADR-007 e resolve o problema de "desenhar o espaço, não o
número": quando a distribuição for medida e a forma final decidida, **o campo
`composto 13` vira `composto faixa média` sem que nada ao redor mude.** O
espaço já está reservado e a hierarquia não depende dele.

### Mobile <640px

Coluna única, container com `--space-4` de padding lateral. As três colunas do
breakdown empilham; cada uma vira uma linha com o traço à esquerda, o percentual
em Mono à direita e o rótulo embaixo. A barra proporcional permanece horizontal
— ela funciona melhor estreita do que os cartões. O manuscrito mantém
`font-size: 1.0625rem`; **não reduzir**, é o conteúdo principal. Ficha técnica
vira lista vertical de pares rótulo/valor.

### Tablet 640–1023px

Container fluido até 60rem. Breakdown em três colunas se couber ≥560px, senão
empilha. Sem outras diferenças.

---

## 7. Componentes

### Campo de URL + ação

Altura 48px (alvo de toque conforme). Fundo `--bg-surface`, contorno
`--elev-line`, raio `--radius-md`, texto Plex Sans 15px.

| Estado | Tratamento |
|---|---|
| Repouso | contorno `--border` |
| Hover | contorno `--border-strong` |
| Foco | contorno `--focus` 1px + anel externo `0 0 0 3px hsl(224 80% 52% / 0.18)` |
| Inválido | contorno `--error` + mensagem abaixo em `--error`, corpo-sm |
| Desabilitado | opacidade 0.55, cursor `progress` |

Botão: fundo `--accent`, texto `--accent-contrast`, 48px de altura, padding
lateral `--space-6`. Hover escurece 6% de luminosidade. Ativo: `scale(0.985)`.
Foco: mesmo anel do campo.

**Rótulo visível** acima do campo (`URL do artigo`, rótulo 12px caixa alta) —
placeholder não é rótulo.

### Marca de sentença

Cada sentença classificada é um `<mark>` com fundo da categoria,
`border-bottom` do traço correspondente, `padding: 1px 2px`, `border-radius:
--radius-sm`, e `box-decoration-break: clone` para que a marca sobreviva à
quebra de linha.

| Estado | Tratamento |
|---|---|
| Repouso | fundo + traço da categoria |
| Hover / foco | contorno `0 0 0 2px` na tinta da categoria; abre popover |
| Foco por teclado | mesmo tratamento — cada marca é `tabindex="0"` |

**Popover de sentença** (`--bg-elevated`, `--elev-pop`, largura máx. 22rem):
nome da categoria, confiança em Mono, e os sinais quando houver.

Texto obrigatório quando há sinais: **"Sinais encontrados no texto"** — nunca
"motivo da classificação". Quando não há, o popover **omite a seção inteira**;
ausência precisa parecer normal, e ~72% das sentenças não terão nenhum.

### Sentenças não classificadas — duas ausências distintas

| Tipo | Tratamento |
|---|---|
| Fora da análise (título, lista, fragmento) | `--text-muted`, sem fundo, sem traço. Atributo `title` com o motivo real |
| Analisável, fora do limite de truncagem | `--text-muted` + `border-bottom: 1px dashed --border-strong` + fundo `--bg-sunken` |

São ausências diferentes e não podem parecer a mesma coisa. A segunda só
aparece quando `truncated: true`, e a legenda ganha a entrada correspondente
**apenas** nesse caso.

### Barra proporcional

Altura 8px, largura total, `--radius-full`, três segmentos na proporção das
categorias. Cada segmento recebe também um `background-image` de listras a 45°
na tinta da própria categoria — a mesma lógica de multicanal do sublinhado.
`role="img"` com `aria-label` descrevendo as três proporções em texto.

---

## 8. Estados reais

### Carregando — a análise leva ~10s

Progresso por estágio, **não spinner**. Cinco estágios listados; o atual em
`--text-primary` com um traço que avança, os concluídos em `--text-muted` com
traço cheio, os futuros em `--text-muted` a 50%.

Cronômetro em Plex Mono ao lado do título — informação verdadeira, e é o que
distingue "trabalhando" de "travado".

**Não simular percentual.** A rota devolve tudo de uma vez; barra que progride
sozinha seria animação inventada, e este produto não inventa medida.

**Esqueleto:** enquanto carrega, a região do resultado mostra a estrutura vazia
— três blocos de breakdown e o painel do manuscrito com linhas em
`--bg-sunken`. Isso reserva o espaço e evita salto de layout.

### Vazio (antes da primeira análise)

Nenhuma ilustração. Abaixo do formulário, em corpo-sm `--text-secondary`: uma
frase sobre o que o produto faz e um exemplo de URL clicável que preenche o
campo. A ressalva já está visível acima — ela não é estado vazio, é permanente.

### Erro

Bloco inline abaixo do formulário: contorno `--error`, fundo
`hsl(4 62% 44% / 0.06)`, `--radius-md`, padding `--space-4`. Mensagem em
`--text-primary` (não em vermelho — vermelho no contorno basta, e texto
vermelho prejudica leitura).

A mensagem vem de `USER_MESSAGES`, **nunca é escrita na tela**. Os 15 códigos já
têm texto acionável.

Erros com `Retry-After` (`RATE_LIMITED`, `BUDGET_EXCEEDED`, `GUARD_UNAVAILABLE`)
mostram abaixo, em Mono 12px, quando tentar de novo.

`role="alert"` para leitor de tela.

### `unscored` — não é erro nem nota zero

Tratamento próprio, e visualmente mais próximo de uma nota editorial que de uma
falha: fundo `--bg-sunken`, sem contorno colorido, título H3 *"Sem medida para
este conteúdo"* e a explicação da razão em corpo.

**Não renderiza breakdown, barra, percentual nem ficha de medição.** Ausência de
medida não é medida zero. A ficha técnica mostra só artigo e execução.

### Avisos não bloqueantes

`truncated` e `suggestionsDegraded` aparecem como faixa em `--notice` sobre
fundo `hsl(38 58% 38% / 0.08)`, dentro do cartão do resultado, acima da ficha
técnica. Corpo-sm. Não interrompem a leitura.

### Offline / falha de rede

O `catch` do fetch já produz mensagem própria. Mesmo tratamento do bloco de
erro, com botão **Tentar novamente** que reenvia a última URL.

---

## 9. Motion

Contida. Esta direção não usa movimento decorativo — cada animação existe para
explicar uma mudança de estado.

| Animação | Gatilho | Propriedade | Duração | Easing | Escalonamento | `prefers-reduced-motion` |
|---|---|---|---|---|---|---|
| Resultado entra | resposta | `opacity`, `translateY(8px→0)` | 320ms | `cubic-bezier(0.22, 1, 0.36, 1)` | seções `index * 60ms` | só `opacity`, 120ms |
| Estágio avança | mudança de estágio | `opacity`, `width` do traço | 240ms | `ease-out` | — | troca instantânea |
| Marca em hover | hover/foco | `box-shadow` | 120ms | `ease-out` | — | instantâneo |
| Popover abre | hover/foco | `opacity`, `scale(0.98→1)` | 140ms | `cubic-bezier(0.22, 1, 0.36, 1)` | — | só `opacity` |
| Botão pressionado | clique | `transform: scale(0.985)` | 100ms | `ease-out` | — | sem transform |
| Cronômetro | 1s | `opacity` do dígito | 100ms | linear | — | sem animação |

Só `opacity`, `transform` e `box-shadow`. Nada de `width`/`height`/`top`/`left`
— exceto o traço de progresso, que é `width` num elemento de 3px sem conteúdo,
onde o custo de layout é irrelevante.

---

## 10. Acessibilidade

- **Contraste:** corpo ≥4,5:1, textos grandes ≥3:1, os três traços de categoria
  ≥3:1 contra o fundo. Valores verificados na seção 3.
- **Cor nunca sozinha:** traço distinto por categoria, listras na barra,
  `aria-label` textual.
- **Teclado:** cada marca de sentença é focável (`tabindex="0"`), e o popover
  abre por foco além de hover. `Esc` fecha. Ordem de tabulação segue a leitura.
- **Alvos de toque:** mínimo 44×44px em campo, botão e links da ficha técnica.
  As marcas de sentença são exceção justificada — são conteúdo em fluxo, e o
  popover também abre por foco de teclado.
- **Leitor de tela:** região de resultado com `aria-live="polite"`; erros com
  `role="alert"`; a barra com `role="img"` e rótulo descritivo.
- **`prefers-reduced-motion`:** tabela da seção 9.
- **Zoom 200%:** container em `rem`, manuscrito em `ch`. Sem quebra.

---

## 11. Mockups para apresentação

**Janela de navegador, 1440×900.** Papel quente ocupando a tela, o manuscrito
centralizado em 68ch com muito ar lateral. A primeira dobra mostra: nome,
ressalva, campo, e o começo da leitura. O texto anotado começa acima da dobra —
é ele que vende o produto num print.

**Mobile 390×844.** Coluna única. A dobra mostra ressalva, campo e a primeira
linha do breakdown. O manuscrito começa logo abaixo, com as marcas visíveis —
mesmo em tela pequena, o traço distinto continua legível.

**Antes e depois.** À esquerda, a tela provisória atual: sistema de fontes
padrão, número grande de 3rem dominando, breakdown como três caixas coloridas
abaixo dele, texto corrido sem hierarquia. À direita, esta direção: o número
sumiu para a ficha técnica, o texto anotado ocupa o centro, e a informação que
o usuário pode agir — *quais* frases não têm fonte — passou a ser o que se vê
primeiro. A comparação conta a história inteira: **saímos de um placar para um
instrumento de leitura.**

---

## 12. Ativos

**Ícones:** cinco, em SVG inline com `stroke-width: 1.5`, herdando
`currentColor` — seta externa (metodologia), alerta (erro), aviso (truncagem),
relógio (execução), e seta de retomada (tentar novamente). Desenhados no
projeto; não vale instalar biblioteca de ícones por cinco glifos.

**Imagens:** nenhuma. Esta direção não usa fotografia nem ilustração — o
conteúdo do usuário é a imagem.

**Textura:** opcional e sutil — grão de papel a 2% de opacidade sobre
`--bg-primary`, via SVG `feTurbulence` inline. **Cortar se custar qualquer
coisa em performance;** é ornamento, não informação.

**Favicon:** um glifo tipográfico — o traço tracejado sobre uma serifa —
em 32/180/192/512px.

---

## 13. Checklist

- [x] Narrativa liga direção visual a público e problema
- [x] Direção é específica do produto, não template
- [x] Cores em HSL derivadas para o projeto; sem valores de exemplo
- [x] Tipografia com tamanhos, pesos e entrelinhas exatos
- [x] Tokens de espaço, raio e elevação definidos
- [x] Contraste CALCULADO por `tests/adapters/ui/contraste.test.ts` — 20 pares
      (10 × 2 temas), todos ≥4,5:1. Não é conferência manual: o teste lê os
      tokens do CSS e reprova o build se alguém mexer numa cor e esquecer.
- [x] Alvos de toque ≥44px, com a exceção justificada
- [x] Foco desenhado para todos os interativos
- [x] Carregando, vazio, erro, esqueleto, `unscored` e offline especificados
- [x] Três mockups contextuais descritos
- [x] Motion com fallback de `prefers-reduced-motion`
- [x] Sem emoji como ícone estrutural
- [x] Cor não é o único canal — traço distinto por categoria
- [x] Composto de 0–100 fora da hierarquia principal (ADR-007)
- [x] Ressalva de metodologia acima da dobra (ADR-004)
- [x] Nenhuma dependência nova além de `next/font`, que já vem no Next
