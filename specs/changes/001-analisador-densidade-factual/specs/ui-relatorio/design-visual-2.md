# Direção visual 2: Precisão Escura

> **Este documento supersede [`design-visual.md`](design-visual.md).**
>
> A direção anterior ("manuscrito revisado" — papel quente, IBM Plex, paleta
> sóbria) foi implementada e comitada em `173b87c`. O usuário a viu rodando e
> reprovou: *"não pode ser esse 'simples' que está atualmente"*.
>
> O diagnóstico não é que a execução falhou — é que **o brief estava errado.**
> Ele pediu "credibilidade sóbria" para um produto que agora precisa parecer
> vendável. Sobriedade sem ambição visual não lê como confiança; lê como
> inacabado. A metáfora do manuscrito era boa e **sobrevive** — o texto marcado
> continua sendo o centro do produto. O que muda é tudo em volta dela.
>
> O que a direção anterior acertou e este documento **preserva**:
> a separação `report-model.ts` / `analyzer.tsx`, o segundo canal não-cromático
> nas categorias, o reset de `mark` no seletor de elemento, e o contraste como
> teste em vez de opinião.
>
> Restrições que **não** mudam, porque são contrato e não estilo:
> [ADR-004](../../../../decisions/004-honestidade-como-contrato.md) e a emenda
> da [ADR-007](../../../../decisions/007-escala-do-score.md).

---

## 1. Enquadramento

**Problema.** Um profissional de SEO precisa saber quais afirmações do próprio
texto estão penduradas sem fonte. Precisa saber *quais*, não *quantas* — uma
nota agregada não diz onde reescrever.

**Público.** Marketer in-house ou consultor de SEO, entre a redação e a
publicação. Chega com um artigo pronto e uma dúvida específica: *isto está
sustentado o bastante?*

**Público secundário, e ele mudou o brief.** O dono do produto quer poder
vender isto. Isso adiciona um segundo leitor: alguém que chega pelo LinkedIn,
não tem problema para resolver ainda, e decide em oito segundos se aquilo
parece um produto ou o trabalho de fim de semana de alguém. Esse leitor não
avalia a análise — avalia o acabamento.

**A ideia que decide tudo.** O produto tem uma medição comprimida e instável, e
tem um argumento raro: **ele diz o que não mediu.** Num nicho saturado de
"SEO Score 87/100" sem metodologia, isso é o ativo. A tela precisa ser
*bonita o bastante para ser levada a sério, e precisa gastar essa credibilidade
afirmando menos, não mais.*

**A solução.** Um instrumento, não um dashboard. Estética de precisão escura —
o idioma de ferramenta profissional — com **uma inversão**: a interface é
escura, e o artigo do usuário aparece numa **folha clara**, como um documento
sobre uma mesa de trabalho. A folha é o objeto mais luminoso da tela porque é o
objeto mais importante do produto.

---

## 2. Direção estética: precisão escura, documento claro

Quase-preto neutro-frio. Estrutura desenhada com **hairlines de 1px**, nunca
com sombra difusa — sombra suave é a assinatura de SaaS de 2020 e é o que faz
uma tela parecer datada em três anos. Tipografia display comprimida com
tracking negativo. **Um único acento luminoso**, gasto com avareza.

O efeito buscado é **competência fria**: alguém construiu um instrumento e o
calibrou. Não é acolhedor, e não deve ser — o produto entrega uma crítica ao
texto do usuário.

A inversão da folha clara é o que impede a direção de virar "mais um app
escuro". Ela cria o único contraste dramático da tela, e o gasta exatamente no
conteúdo que a emenda da ADR-007 manda promover.

### 2.1 Tema único: escuro. Declarado, não omitido.

**A direção compromete-se só com o escuro.** `color-scheme: dark`, sem bloco
`prefers-color-scheme: light`.

Razão: dois temas medianos são piores que um resolvido, e a identidade *é* o
escuro. Um tema claro desta direção seria uma tradução apagada dela — que é
exatamente o defeito que estamos corrigindo.

A leitura longa em fundo escuro, que é a objeção legítima a dark-only, **não se
aplica aqui**: o texto longo do usuário vive na folha clara. A interface escura
carrega rótulos, números e controles — nunca parágrafos.

> **Consequência para o teste:** `tests/adapters/ui/contraste.test.ts` hoje roda
> `describe.each(['claro','escuro'])` lendo o bloco `@media` para separar os
> temas. Com paleta única esse mecanismo perde sentido. O teste deve passar a
> ler um único conjunto de tokens e cobrir **mais pares**, porque agora há duas
> famílias de fundo no mesmo tema: os fundos escuros da interface e a folha
> clara do manuscrito. Trocar tinta de fundo é o erro mais provável aqui.

### 2.2 O que esta direção rejeita explicitamente

Gradiente violeta-para-azul. Glassmorphism e `backdrop-filter` decorativo. Mesh
gradient de fundo. Sombra colorida ou glow difuso atrás de cartão. `box-shadow`
como estrutura. Medidor circular, gauge, semáforo, estrela, troféu, medalha.
Emoji como ícone estrutural. Grid simétrico de três colunas como layout padrão.
Número gigante centralizado. Contador animado subindo até o valor.

### 2.3 Afordância que NÃO pode ser desenhada

Não existe autenticação, não existe cobrança, não existe base de usuários.
Portanto **não há**: botão "Entrar" ou "Criar conta", tabela de planos, preço,
"X análises grátis", contador de análises feitas, logos de "confiado por",
depoimento, badge de segurança.

Isto é a mesma regra que fez o projeto remover uma barra de progresso na rodada
anterior: **elemento que sugere estado inexistente é mentira, mesmo quando é
decorativo.** Um botão de login que não loga é pior que a ausência dele.

**Recomendação registrada para o futuro, não desenhada agora:** quando houver
contas e cobrança, a seção 8 do wireframe (`Limites`) é o lugar natural para
virar `Planos`, e o topbar ganha o par `Entrar` / `Começar`. Prova social só
depois de existirem usuários reais para citar.

---

## 3. Sistema de cor

Paleta única, HSL. Duas famílias de fundo dentro do mesmo tema: a **interface**
(quase-preto) e a **folha** (clara, só para o texto do usuário).

Quase-preto **neutro-frio com saturação muito baixa** — hue 225 a 8-10% de
saturação. Não é o azul-marinho saturado que todo template escuro usa, e não é
cinza morto.

### 3.1 Interface (escuro)

| Token | Valor | Uso |
|---|---|---|
| `--bg-void` | `hsl(226 14% 5%)` | Fundo da página, o mais fundo |
| `--bg-base` | `hsl(226 12% 7%)` | Fundo de seção alternada |
| `--bg-panel` | `hsl(226 11% 10%)` | Painéis, cartões, o campo de entrada |
| `--bg-raised` | `hsl(226 10% 14%)` | Popover, estado hover de painel |
| `--bg-inset` | `hsl(226 15% 4%)` | Ficha técnica, áreas recuadas |
| `--text-bright` | `hsl(220 20% 97%)` | Headlines, números do breakdown |
| `--text-body` | `hsl(220 12% 82%)` | Corpo da interface |
| `--text-dim` | `hsl(220 9% 62%)` | Rótulos, apoio |
| `--text-faint` | `hsl(220 8% 48%)` | Meta, ficha técnica — **par de risco** |
| `--line` | `hsl(226 10% 17%)` | Hairline padrão, 1px |
| `--line-bright` | `hsl(226 10% 26%)` | Hairline de ênfase, contorno de painel |
| `--accent` | `hsl(192 95% 62%)` | O único acento. Botão, link, foco, ativo |
| `--accent-dim` | `hsl(192 60% 26%)` | Acento em repouso, trilha, borda ativa |
| `--accent-ink` | `hsl(226 30% 6%)` | Texto sobre `--accent` |
| `--focus` | `hsl(192 100% 70%)` | Anel de foco, 2px + 2px de offset |
| `--warn` | `hsl(38 88% 62%)` | Truncagem, degradação |
| `--fail` | `hsl(2 78% 66%)` | Falha de operação |

**Sobre o acento.** Ciano luminoso a 62% de luminosidade. Escolhido por ser
**frio e sem valência** — não lê como aprovação (verde) nem alarme (vermelho),
o que importa num produto proibido de sugerir aprovação. Também é o que sobra
depois de descartar violeta (banido), azul-royal (genérico de SaaS) e verde
(valência).

**Uso com avareza — regra dura:** no máximo **dois** elementos com `--accent`
saturado visíveis ao mesmo tempo numa dobra. O botão primário e mais um. Todo o
resto usa `--accent-dim` ou nada. Acento em tudo é acento em nada.

### 3.2 A folha (clara) — só o manuscrito

| Token | Valor | Uso |
|---|---|---|
| `--sheet` | `hsl(40 20% 96%)` | Fundo da folha do manuscrito |
| `--sheet-edge` | `hsl(40 12% 86%)` | Borda e divisores dentro da folha |
| `--sheet-ink` | `hsl(226 24% 12%)` | O texto do usuário |
| `--sheet-dim` | `hsl(226 8% 42%)` | Sentenças fora da análise — **par de risco** |

Levemente quente (hue 40) contra a interface fria. A folha não é branco puro:
`96%` de luminosidade evita o clarão contra o quase-preto em volta.

### 3.3 As três categorias — tintas sobre a folha

Descritivas, não avaliativas. Sem verde/amarelo/vermelho: semáforo comunicaria
aprovação, que é o que a ADR-007 proíbe. São três lápis de revisor de **pesos
iguais**.

| Categoria | Tinta | Fundo do destaque | Traço |
|---|---|---|---|
| Com dado ou fonte | `hsl(186 68% 24%)` | `hsl(186 46% 90%)` | `solid` |
| Sem fonte | `hsl(250 50% 44%)` | `hsl(250 44% 93%)` | `dashed` |
| Opinião | `hsl(32 70% 32%)` | `hsl(32 54% 90%)` | `dotted` |

Herdadas da direção anterior, onde já passaram no teste de contraste. Vivem
apenas sobre `--sheet`, nunca sobre a interface escura.

**No breakdown (que é escuro), a categoria é representada por amostra de traço
em `--text-bright`, não por tinta.** As tintas não têm contraste para fundo
escuro e forçá-las lá é o erro que este documento mais quer evitar.

### 3.4 Contraste — A CALCULAR

**Não há um único número afirmado neste documento.** Afirmar contraste sem
calcular já aconteceu nesta spec e foi corrigido; não vai acontecer de novo.

Todo par abaixo é obrigação do Engineer calcular e ajustar até cruzar o limiar,
com o resultado no teste, não em prosa:

| Par | Limiar | Risco |
|---|---|---|
| `--text-bright` / `--bg-void`, `--bg-base`, `--bg-panel` | 4,5 | baixo |
| `--text-body` / `--bg-void`, `--bg-base`, `--bg-panel` | 4,5 | baixo |
| `--text-dim` / `--bg-void`, `--bg-base`, `--bg-panel` | 4,5 | **médio** |
| `--text-faint` / `--bg-inset`, `--bg-void`, `--bg-panel` | 4,5 | **ALTO** |
| `--accent` / `--bg-void`, `--bg-panel` | 4,5 | médio |
| `--accent-ink` / `--accent` | 4,5 | médio |
| `--warn`, `--fail` / `--bg-void`, `--bg-panel` | 4,5 | médio |
| `--sheet-ink` / `--sheet` | 4,5 | baixo |
| `--sheet-dim` / `--sheet` | 4,5 | **ALTO** |
| cada tinta de categoria / seu fundo de destaque | 4,5 | médio |
| cada tinta de categoria / `--sheet` (sem destaque) | 4,5 | médio |
| `--line-bright` / `--bg-void` | 3,0 | componente gráfico |

> ### Nota de implementação — 2026-08-31
>
> Calculado. Os números vivem em `tests/adapters/ui/contraste.test.ts`, que lê
> os tokens do CSS e reprova o build. Três coisas mudaram na tabela acima:
>
> 1. **`--text-faint` reprovou, como previsto.** Em `48%` media 3,55:1 no pior
>    fundo (`--bg-raised`) e falhava nos cinco. Subiu para `55%`, que é o menor
>    valor que cruza 4,5:1 em todos — agora 4,55:1 no pior caso. `--text-dim`
>    subiu de `62%` para `68%` só para reabrir a folga hierárquica que o faint
>    mais claro havia comido.
>
> 2. **O limiar de `--line-bright` estava ERRADO nesta spec, não a cor.** A
>    WCAG 1.4.11 isenta divisor decorativo, e um hairline de separação a 3:1 em
>    tema escuro viraria uma grade. Os divisores ficam isentos, e a isenção
>    está documentada no teste em vez de silenciada.
>
> 3. **O que de fato precisava de 3:1 era a borda de COMPONENTE, e ela não
>    existia.** O campo de entrada não era identificável nem pela borda
>    (1,86:1) nem pelo próprio preenchimento contra a página. Nasceu
>    `--line-field: hsl(226 10% 45%)`, calculado — 3,08:1 no pior fundo — e ele
>    é visivelmente mais claro que os divisores. Isso muda a aparência do
>    campo, e a mudança é obrigatória, não estética.

Os dois pares marcados **ALTO** são a armadilha estrutural desta direção:
texto discreto sobre fundo quase-preto, e texto discreto sobre folha clara. Foi
exatamente um par `--text-muted` que reprovou duas vezes na rodada anterior.

**Se um valor não cruzar, corrija a cor — não afrouxe o limiar.** `--text-faint`
existe para hierarquia, e hierarquia se faz com peso e tamanho também, não só
com luminosidade.

### 3.5 Cor nunca é o único canal

| Categoria | Traço no sublinhado | Leitura sem cor |
|---|---|---|
| Com dado ou fonte | `border-bottom: 2px solid` | linha cheia — ancorado |
| Sem fonte | `border-bottom: 2px dashed` | tracejado — pendente |
| Opinião | `border-bottom: 2px dotted` | pontilhado — voz do autor |

Três estilos distinguíveis em escala de cinza, em qualquer deficiência de visão
de cor e em impressão preto e branco. A cor é reforço; **o traço é a
informação.** Mesma regra na barra de proporção (§ 9.2) e na legenda.

---

## 4. Tipografia

Três famílias, todas via `next/font/google` — auto-hospedadas, sem CLS, **zero
dependência instalada**. IBM Plex sai inteiro.

| Papel | Família | Por quê |
|---|---|---|
| Display e interface | **Archivo** | Grotesca de aberturas fechadas e formas estreitas, desenhada para funcionar com tracking negativo em tamanho grande. Variável. Não é Inter, não é Roboto, não é a fonte padrão de todo SaaS |
| O manuscrito | **Source Serif 4** | Serifada otimizada para leitura em tela. Serifa na folha e sans na interface é semântica, não enfeite: **distingue o texto do usuário da voz do sistema** |
| Números e meta | **JetBrains Mono** | Mono de altura-x generosa. Tabular por padrão, que é o que faz coluna de número não dançar |

**Orçamento de pesos** — carregar só estes, porque cada peso é um arquivo:
Archivo 400 / 500 / 600, Source Serif 4 400 / 600, JetBrains Mono 400 / 500.

| Nível | Família | Tamanho | Entrelinha | Tracking | Peso | Uso |
|---|---|---|---|---|---|---|
| Display-1 | Archivo | `clamp(2.75rem, 6vw, 4.5rem)` | `0.98` | `-0.04em` | 600 | Headline do hero |
| Display-2 | Archivo | `clamp(1.75rem, 3.5vw, 2.5rem)` | `1.08` | `-0.03em` | 600 | Título de seção |
| H3 | Archivo | `1.0625rem` / 17px | `1.35` | `-0.01em` | 600 | Título de cartão |
| Lead | Archivo | `clamp(1.0625rem, 1.6vw, 1.25rem)` | `1.55` | `-0.01em` | 400 | Subtítulo do hero |
| Corpo | Archivo | `0.9375rem` / 15px | `1.6` | `0` | 400 | Parágrafo de interface |
| Corpo-sm | Archivo | `0.8125rem` / 13px | `1.5` | `0` | 400 | Ressalva, legenda |
| Rótulo | Archivo | `0.6875rem` / 11px | `1.2` | `0.08em` | 500 | Caixa alta, rótulo de seção |
| **Manuscrito** | **Source Serif 4** | **`1.0625rem` / 17px** | **`1.8`** | **`0`** | **400** | **O texto analisado** |
| Dado-g | JetBrains Mono | `clamp(2rem, 4vw, 2.75rem)` | `1` | `-0.02em` | 500 | Percentual do breakdown |
| Dado | JetBrains Mono | `0.875rem` / 14px | `1.4` | `0` | 400 | Cronômetro, contagem |
| Meta | JetBrains Mono | `0.75rem` / 12px | `1.6` | `0` | 400 | Ficha técnica |
| Botão | Archivo | `0.9375rem` / 15px | `1` | `0` | 500 | Ações |

Notas que não são estéticas:

- **Entrelinha `1.8` no manuscrito** é requisito funcional: o sublinhado de
  anotação precisa de ar para não colidir com a linha seguinte. Era `1.75` na
  direção anterior; sobe porque a serifada tem altura-x menor.
- **Tracking negativo só em Display-1, Display-2, H3 e Lead.** Aplicar tracking
  negativo em corpo de 15px reduz legibilidade — é o erro mais comum de quem
  copia esta estética.
- **`font-variant-numeric: tabular-nums`** em toda ocorrência de JetBrains
  Mono. O percentual muda de valor entre análises e não pode deslocar layout.
- Medida de linha: `65ch` no manuscrito, `72ch` em parágrafo de interface.

---

## 5. Tokens

### 5.1 Espaço — base 4px

Mantém a nomenclatura já usada no projeto para não gerar churn, estendida:

`--space-1: 4px` · `--space-2: 8px` · `--space-3: 12px` · `--space-4: 16px` ·
`--space-5: 20px` · `--space-6: 24px` · `--space-8: 32px` · `--space-10: 40px` ·
`--space-12: 48px` · `--space-16: 64px` · `--space-20: 80px` ·
`--space-28: 112px` · `--space-36: 144px`

**Ritmo vertical de seção:** `--space-28` (112px) no desktop,
`--space-16` (64px) no mobile. Uniforme entre todas as seções — o ritmo regular
é o que faz uma página longa parecer projetada em vez de montada.

### 5.2 Raio

| Token | Valor | Uso |
|---|---|---|
| `--r-xs` | `3px` | Destaque inline, tag |
| `--r-sm` | `6px` | Botão, campo |
| `--r-md` | `10px` | Cartão, painel |
| `--r-lg` | `14px` | A folha do manuscrito, painel de resultado |
| `--r-full` | `9999px` | Pílula de rótulo |

Raio contido de propósito. `24px` de raio é linguagem de app de consumo; esta
direção é instrumento.

### 5.3 Borda e elevação

**Não existe escala de sombra nesta direção.** É a decisão que mais define o
resultado, então está declarada como token:

```
--elev-0: none;   /* tudo */
```

Elevação é comunicada por **três** meios, nesta ordem de força:
1. Mudança de fundo (`--bg-void` → `--bg-panel` → `--bg-raised`)
2. Hairline de 1px (`--line` → `--line-bright`)
3. Um único `inset` hairline de topo em painéis grandes:
   `box-shadow: inset 0 1px 0 hsl(220 20% 100% / 0.04)`

O item 3 é a **única** exceção permitida a "sem `box-shadow`", e é `inset` — é
o que simula a quina de metal captando luz. Nunca sombra projetada para fora.

**Exceção necessária:** a folha do manuscrito precisa de separação real do fundo
quase-preto. Ela usa `border: 1px solid var(--sheet-edge)` e nada mais — o
contraste de luminosidade entre folha e fundo já é enorme e sombra ali seria
redundante.

---

## 6. Wireframe

### 6.1 Desktop — 1280px, coluna de conteúdo em `max-width: 1120px`

```
╔══════════════════════════════════════════════════════════════════════════╗
║  ◇ CiteScore                              Como funciona   Método   ↗ Git ║ 0
╟──────────────────────────────────────────────────────────────────────────╢ hairline
║                                                                          ║
║   ANÁLISE DE DENSIDADE FACTUAL                                           ║ 1
║                                                                          ║ HERO
║   Quanto do seu artigo                                                   ║
║   se sustenta de verdade.                                                ║
║                                                                          ║
║   Cada afirmação do texto, classificada em três: tem dado ou fonte,      ║
║   não tem, ou é opinião. Não medimos citação em motores de AI —          ║
║   medimos o que dá para medir.                                           ║
║                                                                          ║
║   ┌────────────────────────────────────────────────────┐ ┌─────────────┐ ║
║   │  https://exemplo.com/artigo                        │ │  Analisar → │ ║
║   └────────────────────────────────────────────────────┘ └─────────────┘ ║
║   Sem cadastro · 10 análises por hora · sem exemplo à mão? use este      ║
║                                                                          ║
╟──────────────────────────────────────────────────────────────────────────╢
║                                                                          ║ 2
║  ┌────────────────────────────────────────────────────────────────────┐  ║ RESULTADO
║  │ ⓘ  MÉTODO                                                          │  ║ (só após
║  │    Este score mede densidade factual — a proporção de afirmações   │  ║ análise;
║  │    sustentadas por dado ou fonte no texto. Ele é uma estimativa    │  ║ âncora de
║  │    derivada dessa medição, não uma medição de citações reais em    │  ║ scroll
║  │    motores de AI. Não consultamos ChatGPT, Perplexity ou AI        │  ║ AQUI
║  │    Overviews para verificar se este conteúdo é efetivamente        │  ║
║  │    citado.                                        Ler o método →   │  ║
║  ├────────────────────────────────────────────────────────────────────┤  ║
║  │                                                                    │  ║
║  │   ──── 12%          ---- 69%          ···· 19%                     │  ║
║  │   com dado/fonte    sem fonte         opinião                      │  ║
║  │   12 sentenças      69 sentenças      19 sentenças                 │  ║
║  │                                                                    │  ║
║  │   ▐████▌▐────────────────────────────────────▌▐──────────▌         │  ║
║  │                                                                    │  ║
║  │   Das 81 afirmações do texto, 69 não citam fonte.                   │  ║
║  └────────────────────────────────────────────────────────────────────┘  ║
║                                                                          ║
║   O TEXTO      ──── com dado/fonte   ---- sem fonte   ···· opinião       ║
║  ┌────────────────────────────────────────────────────────────────────┐  ║
║  │ ░░░░░░░░░░░░░  A  F O L H A  (clara)  ░░░░░░░░░░░░░░░░░░░░░░░░░░░ │  ║
║  │                                                                    │  ║
║  │   SEO is the practice of orienting your website to rank higher.     │  ║
║  │   ‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾  (pontilhado: opinião)        │  ║
║  │   Google's algorithm uses over 200 ranking factors.                 │  ║
║  │   ______________________________________  (cheio: tem fonte)        │  ║
║  │   Most marketers agree this is the hardest part.                    │  ║
║  │   - - - - - - - - - - - - - - - - - - -  (tracejado: sem fonte)    │  ║
║  │                                                                    │  ║
║  │   [o artigo inteiro, remontado, com scroll interno se necessário]   │  ║
║  └────────────────────────────────────────────────────────────────────┘  ║
║                                                                          ║
║  ┌ FICHA TÉCNICA ─────────────────────────────────────────────────────┐  ║
║  │ artigo      moz.com/learn/seo/what-is-seo · 100 sentenças          │  ║
║  │ medição     composto 13/100 · v1 · escala não calibrada            │  ║
║  │ execução    9,4 s · claude-haiku-4-5 · temperature 0              │  ║
║  └────────────────────────────────────────────────────────────────────┘  ║
║                                                                          ║
╟──────────────────────────────────────────────────────────────────────────╢
║   COMO FUNCIONA                                                          ║ 3
║                                                                          ║
║   01 ─── Baixa a página          04 ─── Classifica cada afirmação        ║
║   02 ─── Extrai o conteúdo       05 ─── Calcula a proporção              ║
║   03 ─── Segmenta em sentenças                                           ║
║                                                                          ║
║   [5 passos em grid assimétrico 3+2, cada um com hairline à esquerda]    ║
╟──────────────────────────────────────────────────────────────────────────╢
║   OS TRÊS LÁPIS                                              4           ║
║  ┌──────────────────────┐┌──────────────────────┐┌────────────────────┐  ║
║  │ ────                 ││ - - -                ││ · · ·              │  ║
║  │ Com dado ou fonte    ││ Sem fonte            ││ Opinião            │  ║
║  │                      ││                      ││                    │  ║
║  │ "Segundo o relatório ││ "A maioria dos sites ││ "Esta é a melhor   │  ║
║  │  de 2025 da Ahrefs,  ││  não ranqueia bem."  ││  estratégia para   │  ║
║  │  91% das páginas…"   ││                      ││  qualquer site."   │  ║
║  │                      ││ Afirma um fato mas   ││                    │  ║
║  │ Traz número, fonte   ││ não diz de onde ele  ││ Juízo de valor. Não│  ║
║  │ ou citação           ││ vem. É aqui que se   ││ é falha — é voz do │  ║
║  │ verificável          ││ reescreve            ││ autor             │  ║
║  └──────────────────────┘└──────────────────────┘└────────────────────┘  ║
╟──────────────────────────────────────────────────────────────────────────╢
║   O QUE NÃO MEDIMOS                                                    5 ║
║                                                                          ║
║   ┌ largura 7/12 ────────────────────┐  ┌ largura 5/12 ───────────────┐ ║
║   │ Ferramenta de SEO que promete    │  │ ✗  citação real em ChatGPT, │ ║
║   │ métrica proprietária sem dizer   │  │    Perplexity ou AI Overview│ ║
║   │ como calculou é a norma do       │  │ ✗  posição no Google        │ ║
║   │ nicho. Este produto faz o        │  │ ✗  qualidade de escrita     │ ║
║   │ contrário: a fórmula, os pesos   │  │ ✗  se a fonte citada é boa  │ ║
║   │ e as limitações são públicas.    │  │ ─────────────────────────── │ ║
║   │                                  │  │ ✓  proporção de afirmações  │ ║
║   │ Inclusive a que mais incomoda:   │  │    sustentadas por dado ou  │ ║
║   │ a escala do composto ainda não   │  │    fonte no texto           │ ║
║   │ discrimina bem, e por isso ele   │  └─────────────────────────────┘ ║
║   │ não é a figura principal.        │                                  ║
║   │                     Ler o método →                                  ║
║   └──────────────────────────────────┘                                  ║
╟──────────────────────────────────────────────────────────────────────────╢
║   LIMITES                                                              6 ║
║   ┌───────────────────┐┌───────────────────┐┌───────────────────┐       ║
║   │ 10  / hora        ││ artigos públicos  ││ pt-BR e en        │       ║
║   │ por cliente       ││ só, sem paywall   ││ testado           │       ║
║   └───────────────────┘└───────────────────┘└───────────────────┘       ║
╟──────────────────────────────────────────────────────────────────────────╢
║  ◇ CiteScore                                                           7 ║
║  Análise de densidade factual                    Método   Código ↗      ║
║  ──────────────────────────────────────────────────────────────────────  ║
║  Construído por [NOME DO AUTOR]  ·  2026            Analisar um artigo ↑ ║
╚══════════════════════════════════════════════════════════════════════════╝
```

### 6.2 Mobile — 390px

```
╔══════════════════════════════╗
║ ◇ CiteScore            ☰     ║  topbar 56px, menu = drawer
╟──────────────────────────────╢
║                              ║
║  ANÁLISE DE DENSIDADE        ║  rótulo 11px caixa alta
║  FACTUAL                     ║
║                              ║
║  Quanto do seu               ║  Display-1 em 2.75rem
║  artigo se                   ║  (o clamp inferior)
║  sustenta de                 ║
║  verdade.                    ║
║                              ║
║  Cada afirmação do texto,    ║  Lead
║  classificada em três.       ║  ← texto ENCURTADO no
║  Não medimos citação em      ║    mobile, não só menor
║  motores de AI.              ║
║                              ║
║  ┌────────────────────────┐  ║  campo em bloco,
║  │ https://exemplo.com    │  ║  altura 52px
║  └────────────────────────┘  ║
║  ┌────────────────────────┐  ║  botão 100% de largura,
║  │      Analisar  →       │  ║  altura 52px (≥44 de alvo)
║  └────────────────────────┘  ║
║  Sem cadastro · 10/hora      ║
║                              ║
╟──────────────────────────────╢
║ ┌──────────────────────────┐ ║
║ │ ⓘ MÉTODO                 │ ║  disclaimer INTEIRO,
║ │ Este score mede densi…   │ ║  nunca truncado nem
║ │ [texto completo]         │ ║  atrás de "ver mais"
║ │            Ler método →  │ ║
║ ├──────────────────────────┤ ║
║ │  ──── 12%                │ ║  breakdown EMPILHADO,
║ │  com dado/fonte          │ ║  não 3 colunas
║ │  12 sentenças            │ ║  apertadas
║ │ ┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈ │ ║
║ │  ---- 69%                │ ║
║ │  sem fonte               │ ║
║ │  69 sentenças            │ ║
║ │ ┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈ │ ║
║ │  ···· 19%                │ ║
║ │  opinião                 │ ║
║ │  19 sentenças            │ ║
║ │                          │ ║
║ │ ▐██▌▐──────────▌▐────▌   │ ║  barra mantém altura
║ │                          │ ║  de 10px
║ │ Das 81 afirmações, 69    │ ║
║ │ não citam fonte.         │ ║
║ └──────────────────────────┘ ║
║                              ║
║  O TEXTO                     ║
║  ──── com dado/fonte         ║  legenda EMPILHADA
║  ---- sem fonte              ║
║  ···· opinião                ║
║ ┌──────────────────────────┐ ║
║ │ ░ A FOLHA (clara) ░░░░░░ │ ║  folha ocupa a largura
║ │                          │ ║  toda menos 16px de
║ │  SEO is the practice of  │ ║  cada lado
║ │  orienting your website  │ ║
║ │  ‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾  │ ║
║ │  [texto, 17px, LH 1.8]   │ ║
║ └──────────────────────────┘ ║
║                              ║
║ ┌ FICHA TÉCNICA ───────────┐ ║  rótulo em cima do valor,
║ │ artigo                   │ ║  não ao lado
║ │ moz.com/learn/… · 100 s. │ ║
║ │ medição                  │ ║
║ │ composto 13/100 · v1     │ ║
║ └──────────────────────────┘ ║
╟──────────────────────────────╢
║  COMO FUNCIONA               ║  5 passos em coluna única
║  01 ─ Baixa a página         ║
║  02 ─ Extrai o conteúdo      ║
║  ⋮                           ║
╟──────────────────────────────╢
║  OS TRÊS LÁPIS               ║  3 cartões empilhados
╟──────────────────────────────╢
║  O QUE NÃO MEDIMOS           ║  2 blocos empilhados
╟──────────────────────────────╢
║  LIMITES                     ║  3 em coluna
╟──────────────────────────────╢
║  ◇ CiteScore                 ║
║  Construído por [NOME]       ║
╚══════════════════════════════╝
```

**Regras responsivas:**

- Breakpoints: `640px`, `900px`, `1120px`. Mobile-first.
- **O Lead do hero tem texto mais curto no mobile**, não apenas menor. Duas
  strings, escolhidas por CSS (`display: none` num par de `<span>`) — não por
  JavaScript, para não custar hidratação.
- O breakdown vira coluna única abaixo de `640px`, com hairline horizontal
  entre as três entradas.
- A ficha técnica vira rótulo-acima-do-valor abaixo de `640px`.
- Alvo de toque mínimo: **48px**. Campo e botão do hero em `52px` no mobile.
- Nenhuma interação crítica depende de `:hover`. O popover de sentença (§ 9.3)
  abre por clique/toque, com `:hover` como atalho adicional no desktop.

---

## 7. As seções, uma a uma

| # | Seção | O que AFIRMA | Com que elemento |
|---|---|---|---|
| 0 | Topbar | Isto é um produto com nome | Wordmark `◇ CiteScore`, 3 links de texto. Altura 56px, `position: sticky`, `border-bottom: 1px`. Fundo `--bg-void` com `backdrop-filter: saturate(180%) blur(12px)` **apenas** aqui — é funcional (legibilidade sobre conteúdo que rola), não decorativo |
| 1 | Hero | O que o produto faz, e o que ele não faz, na mesma dobra | Rótulo caixa alta + Display-1 em duas linhas + Lead de 3 linhas + **a ferramenta**. Sem imagem, sem ilustração |
| 2 | Resultado | A medição | Painel único: barra de método (o disclaimer), breakdown, folha do manuscrito, ficha técnica. Detalhado em § 9 |
| 3 | Como funciona | O método é um pipeline, não uma caixa-preta | 5 passos, grid assimétrico 3+2, cada um com número em mono e hairline vertical à esquerda. **Os 5 passos são os estágios reais do pipeline** — mesma lista que o estado de carregamento usa |
| 4 | Os três lápis | O que cada categoria significa, com exemplo | 3 cartões, `--bg-panel`, hairline. Cada um abre com a amostra de traço. Os exemplos são **inventados como ilustração e rotulados como exemplo** — não são saída real do sistema |
| 5 | O que não medimos | A honestidade como argumento de venda | Grid assimétrico 7/12 + 5/12. Prosa à esquerda, lista ✗/✓ à direita. É a seção que converte, e ela converte dizendo menos |
| 6 | Limites | Os limites reais, sem eufemismo | 3 blocos com número grande em mono. Só fatos verificáveis: 10/hora, artigos públicos, idiomas testados |
| 7 | Rodapé | Quem construiu | Wordmark, links, nome do autor, e um link "Analisar um artigo ↑" que volta ao hero |

**Sobre a seção 5.** É onde o disclaimer deixa de ser obrigação e vira
posicionamento. O texto admite explicitamente que a escala do composto não
discrimina bem — porque admitir isso é mais forte que esconder, e porque é
verdade registrada na emenda da ADR-007.

**O nome do autor no rodapé é placeholder `[NOME DO AUTOR]`.** O Engineer não
deve inventá-lo; deve deixar o placeholder ou perguntar.

---

## 8. A ferramenta e seus estados reais

### 8.1 O campo

| Estado | Aparência |
|---|---|
| Repouso | `--bg-panel`, `border: 1px solid var(--line)`, `--r-sm`, altura 52px, texto `--text-body`, placeholder `--text-faint` |
| Hover | `border-color: var(--line-bright)`. 120ms |
| Foco | `border-color: var(--accent-dim)` + `outline: 2px solid var(--focus)` com `outline-offset: 2px`. **O outline não é removido nunca** |
| Inválido | `border-color: var(--fail)` + mensagem abaixo em Corpo-sm `--fail`. Só depois do submit, nunca enquanto digita |
| Desabilitado | `opacity: 0.5`, `cursor: not-allowed` |

**Rótulo real e visível** (`URL do artigo`, nível Rótulo), não placeholder como
rótulo. Placeholder desaparece ao digitar e leitor de tela pode ignorá-lo.

### 8.2 O botão primário

| Estado | Aparência |
|---|---|
| Repouso | `background: var(--accent)`, texto `--accent-ink`, peso 500, altura 52px, padding lateral `--space-6`, `--r-sm` |
| Hover | `filter: brightness(1.08)`. 120ms |
| Ativo | `transform: scale(0.985)`. 90ms |
| Foco | `outline: 2px solid var(--focus)`, offset 2px |
| Carregando | texto vira `Analisando…`, `--accent-dim` de fundo, desabilitado |

### 8.3 Estado vazio (idle)

Não existe ilustração de estado vazio, e não deve existir: o hero **já é** o
estado vazio, e ele está cheio de conteúdo útil. Abaixo do campo, uma linha em
Corpo-sm `--text-dim`: `Sem cadastro · 10 análises por hora ·` + o botão de
texto `use este` que preenche o exemplo.

### 8.4 Carregando

**Sem barra de percentual e sem estágio destacado como "atual".** A rota devolve
tudo de uma vez; o cliente não sabe onde o servidor está. Marcar um passo como
concluído seria estado fabricado, e isto foi removido do produto na rodada
anterior por exatamente essa razão.

O que o estado mostra:

```
┌──────────────────────────────────────────────┐
│  Analisando                            9,4 s │  ← cronômetro real, mono
│  ────────────────────────────────────────────│
│  Costuma levar de 10 a 60 segundos.          │
│  O sistema percorre:                         │
│    ─ Baixa a página                          │  ← sequência, sem estado
│    ─ Extrai o conteúdo principal             │
│    ─ Segmenta em sentenças                   │
│    ─ Classifica cada afirmação               │
│    ─ Calcula a proporção                     │
└──────────────────────────────────────────────┘
```

Um único elemento animado: uma **hairline de 2px** no topo do painel, com um
segmento de `--accent` de 25% de largura em varredura infinita de 1,4s. É
animação **indeterminada** por construção — não afirma progresso, afirma
atividade. É a distinção que importa.

`prefers-reduced-motion`: a varredura para; a hairline fica estática em
`--accent-dim`. O cronômetro continua contando, porque é texto, não movimento.

### 8.5 Esqueleto

**Não há esqueleto.** Considerado e rejeitado: esqueleto que espelha o layout
final promete a forma do resultado antes de saber se haverá resultado — a
análise pode falhar, ou vir `unscored`. O painel de carregamento (§ 8.4) ocupa
o lugar, com altura própria, e não há salto porque o resultado abre abaixo do
hero e não empurra nada acima dele.

### 8.6 Erro

Painel em `--bg-panel` com `border-left: 2px solid var(--fail)`, `role="alert"`.
Título em H3, mensagem em Corpo. **A mensagem vem do servidor**, não é inventada
no cliente.

Quando houver `Retry-After`, uma segunda linha em Meta: `tente novamente em
4 min`. Quando o erro for de rede, uma ação `Tentar de novo` — botão secundário
(`--bg-raised`, hairline, texto `--text-bright`), nunca o primário.

### 8.7 Offline

`window.navigator.onLine === false` desabilita o botão e mostra, abaixo do
campo, `Sem conexão` em Corpo-sm `--warn`. **Não há estado em cache para
mostrar** — o produto não guarda histórico. Fingir um seria inventar dado.

### 8.8 Sucesso

**Não há celebração.** Sem confete, sem checkmark, sem toast. O resultado
aparecer *é* o sucesso, e o resultado é frequentemente uma má notícia sobre o
texto do usuário — comemorá-lo seria tonalmente errado.

O único sinal: o painel de resultado entra com o reveal de § 10, e o foco do
teclado move para o título da região de resultado (`tabindex="-1"` + `focus()`),
para que leitor de tela anuncie a chegada.

---

## 9. O resultado

### 9.1 A barra de método — onde a ADR-004 é satisfeita

Esta é a restrição de composição mais difícil do documento. A ADR-004 item 3
exige: *"o disclaimer é conteúdo, não rodapé. Fica na região do resultado,
legível sem scroll, no mesmo nível hierárquico do score."*

Num hero alto, "sem scroll" não pode significar "no topo da página" — o
resultado não está lá. **A leitura correta é: sem scroll adicional dentro da
região do resultado.** A solução:

1. A barra de método é o **primeiro filho** do painel de resultado, acima do
   breakdown, dentro da mesma borda. Mesmo nível hierárquico, não subordinado.
2. Ao concluir a análise, a página traz o topo do painel de resultado para o
   topo da viewport (`scrollIntoView({ block: 'start' })`, com
   `scroll-margin-top` de 56px + `--space-6` para não ficar sob o topbar
   sticky). O disclaimer é então **a primeira coisa visível na região**, sem
   nenhum scroll.
3. `prefers-reduced-motion` → `behavior: 'auto'` em vez de `'smooth'`.

**Forma:** fundo `--bg-inset`, hairline embaixo, rótulo `MÉTODO` em Rótulo
`--text-dim`, o texto em Corpo `--text-body` a `62ch`, e o link `Ler o método →`
em `--accent` alinhado à direita.

**O texto é `DISCLAIMER_PT_BR`, vindo do domínio.** Nunca reescrito na UI, nunca
truncado, nunca atrás de "ver mais", nunca colapsado no mobile.

### 9.2 O breakdown — a figura principal

Três entradas em grid `1fr 1fr 1fr` (coluna única abaixo de 640px). Cada uma:

```
──── 12%              ← amostra de traço + Dado-g em --text-bright
com dado ou fonte     ← H3 em --text-body
12 sentenças          ← Meta em --text-faint
```

A **amostra de traço** é um `<span>` de 24×3px com `border-top` no estilo da
categoria, em `--text-bright`. É o segundo canal, e ele funciona porque as
tintas de categoria não vivem na interface escura.

**A barra de proporção** abaixo: altura 10px, `--r-full`, três segmentos com
largura proporcional. Cada segmento é distinguível **sem cor** por padrão de
preenchimento — sólido, listrado a 45°, e pontilhado — construídos com
`repeating-linear-gradient` em tons de `--text-bright` a opacidades diferentes.
`role="img"` com `aria-label` descrevendo as três proporções em texto.

**O resumo** abaixo da barra, em Corpo `--text-body`: `Das 81 afirmações do
texto, 69 não citam fonte.` Já implementado em `report-model.ts::summarize`,
com os casos de borda tratados. Não mexer na aritmética.

### 9.3 A folha do manuscrito

O objeto mais luminoso da tela, e isso é intencional — é o valor central do
produto e a emenda da ADR-007 manda promovê-lo.

- Fundo `--sheet`, `border: 1px solid var(--sheet-edge)`, `--r-lg`,
  padding `--space-8` (desktop) / `--space-5` (mobile)
- Texto em Manuscrito (Source Serif 4, 17px, LH 1.8), cor `--sheet-ink`
- Medida `65ch`, centralizada na folha
- Altura máxima `70vh` com `overflow-y: auto` e hairline de topo/base indicando
  que há mais — **nunca `max-height` sem indicação de corte**
- Sentenças fora da análise (`excluded`, `unanalyzed`) em `--sheet-dim`, sem
  sublinhado, com `title` explicando por quê

**Renderizado como TEXTO, nunca como HTML.** O conteúdo vem de página arbitrária
de terceiro; injetá-lo como markup seria XSS refletido com passos extras. Há
regra de lint bloqueando `dangerouslySetInnerHTML` e ela fica.

**Estrutura de CSS obrigatória** — herdada da direção anterior porque protege
contra um bug que já aconteceu:

```
mark { background: transparent; color: inherit; box-decoration-break: clone; }
.cat-SOURCED   { background: …; color: …; border-bottom-style: solid;  }
.cat-UNSOURCED { background: …; color: …; border-bottom-style: dashed; }
.cat-OPINION   { background: …; color: …; border-bottom-style: dotted; }
```

O reset vive no seletor de **elemento**, especificidade (0,0,1). As categorias
em classes, (0,1,0). **Nenhuma regra descendente pode mirar `mark`** — uma regra
`.folha mark` teria (0,1,1) e roubaria o fundo de todos os destaques,
independente da ordem. Isso já aconteceu, passou por revisão de código, e a tela
não pareceu quebrada. `tests/adapters/ui/guarda-estrutural.test.ts` guarda a
propriedade e deve continuar guardando.

**Popover de sentença — recurso novo, e o único que pede dado novo.** Ao
clicar numa sentença marcada, abre um popover em `--bg-raised` com hairline,
mostrando a categoria, a confiança, e **os `signals`**, que hoje não são
exibidos em lugar nenhum.

> **Dado que o `report-model.ts` precisa passar a expor:** `Segment` do tipo
> `classified` ganha `readonly confidence: number` e
> `readonly signals: readonly string[]`. Ambos já existem em
> `Analysis.classifications`; é repasse, não computação nova. Fecha por `Esc`,
> por clique fora, e devolve o foco à sentença.

### 9.4 A ficha técnica — onde o composto mora

Fundo `--bg-inset`, hairline, Meta (JetBrains Mono 12px), três linhas de
`rótulo | valor` com o rótulo em `--text-faint` e o valor em `--text-dim`.

```
artigo      moz.com/learn/seo/what-is-seo · 100 sentenças
medição     composto 13/100 · v1 · escala não calibrada
execução    9,4 s · claude-haiku-4-5 · temperature 0
```

**Isto é o cumprimento literal de "desenhe o espaço, não o número".** O composto
aparece — porque removê-lo perderia informação — em corpo de 12px, em mono, numa
lista de metadados de execução, ao lado da versão da fórmula e do tempo de
processamento. Ele tem exatamente o peso visual de um número de build.

E ele carrega a ressalva `escala não calibrada` na mesma linha, porque a linha
pode ser lida isolada num screenshot.

**Proibições que esta forma torna estruturalmente difíceis de violar:** não há
onde crescer o número sem quebrar o alinhamento da lista; não há cor associada a
ele; não há faixa, rótulo qualitativo, seta de tendência, nem comparação. A
linha `medição` é omitida por completo quando o resultado é `unscored` — já
implementado em `buildRecord`.

### 9.5 Resultado sem medida (`unscored`)

Painel em `--bg-panel` com hairline, H3 `Sem medida para este conteúdo` e a
mensagem que vem de `report-model.ts::buildScorePanel`. Sem breakdown, sem
folha, sem ficha técnica de medição. **Sem número zero** — zero é uma medição,
e não houve medição.

### 9.6 Avisos

`truncated` e `suggestionsDegraded` renderizam faixas em `--bg-panel` com
`border-left: 2px solid var(--warn)`, dentro do painel de resultado, acima do
breakdown e **abaixo** da barra de método. O disclaimer nunca é empurrado para
fora da primeira posição.

---

## 10. Coreografia de movimento

Movimento escasso e curto. Esta direção comunica precisão, e precisão não
gesticula.

| Animação | Disparo | Propriedade | Duração | Easing | Stagger | `prefers-reduced-motion` |
|---|---|---|---|---|---|---|
| Entrada do hero | load | `opacity`, `translateY(12px→0)` | 420ms | `cubic-bezier(0.22,1,0.36,1)` | `index * 60ms` | opacidade 1, sem translate |
| Reveal de seção | scroll, 15% na viewport | `opacity`, `translateY(16px→0)` | 480ms | `cubic-bezier(0.22,1,0.36,1)` | `index * 50ms` | visível de imediato |
| Varredura de carregamento | estado loading | `transform: translateX` | 1400ms, infinita | `linear` | — | **para**; hairline estática em `--accent-dim` |
| Entrada do resultado | análise concluída | `opacity`, `translateY(20px→0)` | 520ms | `cubic-bezier(0.22,1,0.36,1)` | painel → breakdown → folha, 80ms | opacidade instantânea |
| Barra de proporção | resultado visível | `transform: scaleX(0→1)`, origem à esquerda | 620ms | `cubic-bezier(0.22,1,0.36,1)` | `index * 70ms` | `scaleX(1)` de imediato |
| Hover de painel | hover | `border-color` | 140ms | `ease-out` | — | mantém (não é movimento) |
| Pressão de botão | active | `transform: scale(0.985)` | 90ms | `ease-out` | — | troca instantânea de estado |
| Popover de sentença | clique | `opacity`, `scale(0.97→1)` | 160ms | `cubic-bezier(0.22,1,0.36,1)` | — | só opacidade |
| Scroll ao resultado | análise concluída | `scroll-behavior: smooth` | nativo | — | — | `behavior: 'auto'` |

**Somente `opacity` e `transform`.** Nada de animar `width`, `height`, `top`,
`left` ou `box-shadow`.

**O número do breakdown NÃO tem contador animado subindo até o valor.** É a
assinatura mais clara de dashboard de 2020, e aqui teria um segundo problema:
faria uma medição instável parecer um instrumento se assentando.

**Nenhum efeito de cursor.** Sem parallax, sem glow seguindo o mouse, sem
spotlight. Foi considerado e rejeitado: é decorativo, custa frame budget e é
justamente a assinatura de "template moderno" que esta direção quer evitar.

`@media (prefers-reduced-motion: reduce)` desliga todas as transições e
animações com uma regra global, e as exceções acima são as que precisam de
tratamento explícito em vez de simples desligamento.

---

## 11. Ícones, ativos e visualização

### 11.1 Ícones — SVG inline, traço de 1,5px

Nenhuma biblioteca de ícones. Sete ícones, desenhados como SVG inline de
24×24 com `stroke-width: 1.5`, `currentColor`, sem preenchimento:

`seta-direita` (botão, links) · `seta-cima` (voltar ao topo) ·
`link-externo` (Git, método) · `info` (barra de método) ·
`alerta` (truncagem) · `x` (fechar popover) · `menu` (drawer mobile)

**O wordmark `◇`** é um losango SVG de 12×12 com traço de 1,5px em `--accent`,
não o caractere Unicode — para não depender de fonte do sistema.

**Zero emoji em qualquer posição estrutural.**

### 11.2 Imagens

**Nenhuma.** Sem hero image, sem ilustração, sem foto, sem mockup de laptop.
A tipografia e a folha clara carregam a composição. Isso também mantém o
First Load JS onde está e não adiciona nada ao orçamento de imagem.

### 11.3 Textura

**Uma única:** grão de ruído a `opacity: 0.015` sobre `--bg-void`, como
`background-image` de um SVG `feTurbulence` inline em data URI, `~200 bytes`.
Existe por razão técnica, não estética: quase-preto em painel grande mostra
banding em tela de 8 bits, e o ruído o quebra.

`pointer-events: none`, `position: fixed`, atrás de todo conteúdo.

### 11.4 Favicon e ativos exportados

| Ativo | Formato | Nome |
|---|---|---|
| Favicon | SVG (o losango) + PNG 32/180/192/512 | `icon.svg`, `apple-icon.png` |
| OG image | 1200×630 PNG, gerada por `next/og` | `opengraph-image.tsx` |

**A OG image importa para o LinkedIn** — é o que aparece quando o link é
postado. Composição: fundo `--bg-void` com o grão, o wordmark no canto, a
headline `Quanto do seu artigo se sustenta de verdade.` em Display-1, e a
amostra dos três traços embaixo. **Sem número, sem exemplo de resultado** — um
resultado no OG seria afirmar uma medição fora de contexto.

### 11.5 Visualização de dado

A única visualização é a barra de proporção de § 9.2. Não há gráfico de linha,
pizza ou série temporal, e não deve haver: o produto faz uma análise avulsa e
não guarda histórico. Gráfico de tendência exigiria dado que não existe.

| Elemento | Token | Segundo canal |
|---|---|---|
| Segmento "com dado/fonte" | `--text-bright` a `opacity: 1` | preenchimento sólido |
| Segmento "sem fonte" | `--text-bright` a `opacity: 0.55` | listras 45°, 3px |
| Segmento "opinião" | `--text-bright` a `opacity: 0.3` | pontilhado, 2px |
| Trilha | `--bg-inset` | — |

Contraste de cada segmento contra a trilha: **a calcular**, limiar 3,0 (é
componente gráfico, não texto).

---

## 12. Navegação e fluxo

**Topbar sticky**, 56px, com `Como funciona`, `Método`, `Código ↗`. No mobile,
drawer que entra pela direita: overlay `hsl(226 20% 3% / 0.7)`, painel a 82% de
largura, fecha por `Esc`, por clique no overlay e por botão `x`. Foco preso no
drawer enquanto aberto; devolvido ao botão que o abriu ao fechar.

**Não há command palette** e não deve haver: a aplicação tem uma ação. Atalho
de teclado seria enfeite de ferramenta profissional sem a ferramenta.

**Atalhos reais, esses sim:** `Enter` no campo submete (é `<form>`, vem de
graça) e `Esc` fecha popover e drawer.

**Fluxo de conversão.** A ferramenta está **na primeira dobra** — não há CTA que
rola até um formulário, porque o formulário é o herói. O link do rodapé
`Analisar um artigo ↑` é o único retorno, para quem leu a página inteira.

Sem CTA sticky, sem banner de saída, sem modal de intenção de saída. O produto
não tem para onde converter ainda; fingir que tem seria a mesma mentira de
§ 2.3.

**Ordem de foco de teclado** segue a ordem do DOM, que segue a ordem visual.
Um `Pular para a análise` como primeiro elemento focável, visualmente oculto
até receber foco.

---

## 13. Mockups de apresentação

**1. Moldura de navegador, 1440px.** Barra de navegador clara, e abaixo dela o
quase-preto ocupando tudo. Acima da dobra: topbar, rótulo, a headline em duas
linhas ocupando cerca de 40% da largura, o Lead, e o campo com o botão ciano —
o único elemento saturado da tela. A dobra corta logo abaixo da linha
`Sem cadastro · 10 análises por hora`. Nada de resultado visível: a primeira
impressão é de instrumento em repouso.

**2. Mobile 390×844, com resultado.** Safe area respeitada: `padding-bottom:
env(safe-area-inset-bottom)` no rodapé, e o topbar com
`padding-top: env(safe-area-inset-top)`. O enquadramento mostra a barra de
método completa no topo do painel de resultado e o início do breakdown
empilhado — provando visualmente que o disclaimer não foi sacrificado no
mobile, que é onde ele normalmente é a primeira coisa a cair.

**3. Antes e depois.** Lado a lado, mesma largura. À esquerda, a direção
anterior: papel quente, uma coluna estreita, tudo em pesos parecidos, sem
hierarquia dominante — o que o usuário chamou de simples. À direita, esta:
quase-preto, headline de 72px, a folha clara como objeto luminoso no centro.
A legenda do par nomeia o que mudou e o que **não** mudou: *a paleta, a
tipografia e a estrutura foram refeitas; o disclaimer, o breakdown como figura
principal e o composto como nota de rodapé técnica são idênticos, porque são
contrato.*

---

## 14. O que este documento pede ao código

Registrado aqui para o Engineer não precisar inferir:

1. **`globals.css` reescrito.** Paleta única, sem bloco
   `prefers-color-scheme: light`. `color-scheme: dark` no `:root`.
2. **`layout.tsx`:** trocar as três fontes IBM Plex por Archivo, Source Serif 4
   e JetBrains Mono, com o orçamento de pesos de § 4.
3. **`page.tsx`:** passa de uma tela para as 8 seções de § 6. É o arquivo que
   mais cresce.
4. **`analyzer.tsx`:** mantém a lógica; muda a marcação e ganha o popover de
   sentença e o `scrollIntoView` do resultado.
5. **`report-model.ts`:** `Segment` do tipo `classified` ganha `confidence` e
   `signals` (repasse de `Analysis.classifications`, § 9.3).
6. **`tests/adapters/ui/contraste.test.ts`:** perde a dimensão de tema, ganha os
   pares de § 3.4 — incluindo os da folha clara.
7. **`tests/adapters/ui/guarda-estrutural.test.ts`:** continua valendo sem
   mudança. A estrutura de `mark` de § 9.3 é a mesma.
8. **Novo `opengraph-image.tsx`** por § 11.4.
9. **Placeholder `[NOME DO AUTOR]`** no rodapé, a ser preenchido pelo usuário.

**Nenhuma dependência nova.** `next/font`, `next/og` e CSS puro cobrem tudo.

---

## 15. Checklist de pré-implementação

- [x] A narrativa liga a direção visual ao público e ao problema
- [x] A direção é específica do contexto e não copia template de AI: sem
      gradiente violeta, sem glassmorphism, sem mesh gradient, sem sombra difusa
- [x] Cores em HSL derivadas para este produto; nenhum valor de exemplo copiado
- [x] Tipografia com tamanho, peso, entrelinha e tracking exatos
- [x] Tokens cobrem espaço, raio, borda e a ausência declarada de sombra
- [ ] **Contraste CALCULADO** — § 3.4 lista todos os pares e nenhum número é
      afirmado neste documento. **Obrigação do Engineer, com o resultado no
      teste**
- [x] Alvo de toque ≥48px; campo e botão a 52px no mobile
- [x] Estado de foco especificado para todo elemento interativo, com `outline`
      que nunca é removido
- [x] Estados reais especificados: idle, carregando, erro, offline, sucesso,
      sem-medida. Esqueleto **rejeitado com razão escrita**
- [x] Três mockups contextuais descritos
- [x] Movimento com fallback de `prefers-reduced-motion` em toda linha
- [x] Zero emoji em posição estrutural
- [x] Segundo canal não-cromático nas três categorias (traço) e nos segmentos da
      barra (padrão de preenchimento)
- [x] Popover: fecha por `Esc`, por clique fora, devolve o foco. Drawer: foco
      preso, `Esc`, clique no overlay
- [x] Navegação por teclado especificada; `Pular para a análise` como primeiro
      focável. Command palette **rejeitada com razão escrita**
- [x] A ferramenta está na primeira dobra; sem CTA sticky nem modal de saída
- [x] Layout assimétrico onde há mais de um bloco (7/12 + 5/12 na seção 5,
      grid 3+2 na seção 3); os grids de 3 colunas restantes são listas de três
      itens iguais, não decoração
- [x] **ADR-004:** disclaimer do domínio, íntegro, primeiro filho do painel de
      resultado, com scroll levando o topo do painel à viewport; "citabilidade"
      não rotula número; a métrica se chama Densidade Factual
- [x] **Emenda ADR-007:** breakdown é a figura principal; o composto vive na
      ficha técnica em mono de 12px com a ressalva `escala não calibrada` na
      mesma linha; sem nota, medalha, semáforo, faixa ou comparação
- [x] **Nenhuma afordância inexistente desenhada** — sem login, plano, preço,
      prova social ou contador. Recomendação futura registrada em § 2.3, não
      desenhada
