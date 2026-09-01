# ADR-007 — A escala do score mede contra um teto inalcançável

- **Data:** 2026-08-28
- **Status:** aceita (diagnóstico) · pesos **não alterados** até haver medição
- **Relação:** emenda [ADR-003](003-formula-do-score.md)
- **Base:** calibração de 2026-08-28, 331 sentenças classificadas em 3 artigos

## Contexto

A [ADR-003](003-formula-do-score.md) definiu:

```
FD  = sourced / N
GAP = unsourced / (sourced + unsourced)
CiteScore = round(100 * (0,6 * FD + 0,4 * (1 - GAP)))
```

e registrou explicitamente que os pesos 0,6 / 0,4 eram **"um ponto de partida, não um resultado"**, a serem questionados pela calibração de M2. A calibração aconteceu.

### O que foi medido

| Artigo | Tipo esperado | Analisáveis | S | U | O | Score |
|---|---|---|---|---|---|---|
| Ahrefs — blog SEO | MIX | 149 | 26 | 60 | 63 | **23** |
| Moz — página pilar | A-dominante | 100 | 19 | 40 | 41 | **24** |
| MDN — doc técnica | B-dominante | 82 | 13 | 58 | 11 | **17** |

Agregado das 331 sentenças: **17,5% SOURCED · 47,7% UNSOURCED · 34,7% OPINION**.

### Duas leituras dos dados

**A classificação parece boa.** Os perfis fazem sentido qualitativamente: a documentação técnica do MDN tem 11 opiniões em 82 sentenças, o blog de SEO da Ahrefs tem 63 em 149. O modelo está separando os tipos de conteúdo de forma plausível. **O problema não é a classificação — é a régua.**

**A régua não discrimina.** Três artigos de perfis deliberadamente diferentes produziram scores em uma faixa de 7 pontos, todos entre 17 e 24. E o artigo escolhido no golden dataset como *"modelo de como um bom artigo SEO factual se parece"* — a página pilar do Moz — tirou **24 de 100**.

### O erro de projeto

A fórmula avalia `FD` contra a escala teórica de 0 a 1, onde 1 significa **toda sentença do texto tem fonte explícita**. Nenhum texto real chega perto disso: prosa precisa de transições, contexto, definições e conclusões, que não carregam fonte por natureza. A medição diz que o valor típico gira em torno de 0,175.

É o mesmo erro de avaliar altura humana numa régua de 0 a 3 metros. Todo mundo cai entre 1,5 e 2,0, a régua está tecnicamente correta, e é inútil para comparar pessoas.

O termo `1 - GAP` sofre menos do problema, porque a proporção de afirmações sustentadas entre as afirmações feitas é uma razão naturalmente mais espalhada. Mas ele entra com peso 0,4 e não compensa a compressão de `FD`.

### Por que isso é risco de produto, não só de estatística

Se as melhores páginas do próprio nicho tiram 23 e 24, o produto tem dois modos de falha:

1. **Não discrimina.** Um usuário que melhorar o conteúdo verá o score subir de 23 para 26 e não saberá se melhorou ou se é ruído.
2. **Desmotiva por engano.** Um número baixo lido como nota escolar sugere "seu conteúdo é ruim" quando o texto pode estar dentro do que é normal e bom no formato.

Isso colide diretamente com [ADR-004](004-honestidade-como-contrato.md): um número que sistematicamente subestima não é mais honesto por ser tecnicamente derivável — apresenta uma medida com significado implícito que ela não tem.

## Decisão

**Os pesos NÃO são alterados agora.** A ADR-003 permanece vigente na fórmula.

Alterar a régua com base em 3 artigos, todos em inglês, seria repetir o erro que criou este problema: escolher constante sem dado suficiente. Trocar 0,6/0,4 por outro par arbitrário produziria outra escala arbitrária, agora com a aparência de ter sido calibrada.

**O que fica decidido é o que medir antes de decidir.**

### Plano de medição obrigatório antes de mexer na fórmula

1. **Rodar o corpus completo** — os 11 artigos baixados, PT-BR e EN, e não apenas os 3 que couberam antes do teto de custo. Custo estimado: ~US$ 0,40.
2. **Estabelecer a distribuição observada** de `FD` e `GAP` por tipo de conteúdo (`A-dominante`, `MIX`, `B-dominante`, `OPINIAO-PURA`, `LISTA-TABELA`), que o golden dataset já classifica.
3. **Verificar se a fórmula ordena corretamente.** A pergunta não é se o número é alto ou baixo, e sim se um artigo denso em fonte pontua **acima** de um artigo raso. Ordenação correta com escala comprimida é problema de apresentação; ordenação errada é problema de fórmula, e muito mais grave.
4. **Conferir manualmente** o CSV sentença a sentença já gerado, para separar erro de classificação de característica do texto.

### Caminhos que a medição vai escolher entre

Registrados para que a decisão futura seja entre opções pensadas, não improvisada:

| Caminho | O que faz | Risco |
|---|---|---|
| **Reponderar** | Ajustar 0,6/0,4 para dar mais peso ao termo que discrimina | Continua comprimido se `FD` seguir dominando |
| **Normalizar por linha de base** | Mapear a faixa observada para 0–100 | Precisa de amostra grande; muda o significado do número |
| **Manter e mudar a apresentação** | A escala fica; a UI mostra faixas ("típico", "acima do típico") em vez de sugerir nota | Preserva a honestidade e resolve a leitura |
| **Trocar `FD` por percentil** | Score = posição relativa ao corpus | Exige corpus de referência mantido; deixa de ser medida absoluta |

O terceiro caminho merece destaque porque é o mais barato e talvez o mais honesto: o problema pode não ser a fórmula, e sim apresentá-la como se 100 fosse alcançável.

**Qualquer alteração de peso, limiar ou normalização exige incrementar `SCORE_VERSION`**, conforme a ADR-003 já estabelece.

## Consequências

**Positivas**

- A fórmula não é alterada no escuro. O erro que produziu o problema não se repete.
- Fica registrado que a compressão é um risco **de produto**, não uma curiosidade estatística.
- O critério de sucesso da próxima medição está escrito: ordenação correta importa mais que amplitude.

**Negativas**

- A UI de M3 não pode ser desenhada em cima de uma escala estável, porque ela pode mudar. O Designer precisa saber disso.
- Adia uma decisão que afeta a percepção do produto por quem o usar.

**Aceito conscientemente:** é melhor um número comprimido e honesto agora do que uma normalização inventada que pareça calibrada sem ser.

---

# EMENDA — 2026-08-29: a base de evidência desta ADR era instável

## O que aconteceu

O classificador **nunca definiu `temperature`**. Usava o default do provedor,
1.0 — amostragem máxima. Todos os números da tabela acima foram colhidos assim.

Com `temperature: 0`, o artigo do Moz foi medido seis vezes:

| | S | U | O | Score |
|---|---|---|---|---|
| Registrado nesta ADR | 19 | 40 | 41 | **24** |
| Medido agora (5 de 6 execuções) | 12 | 69 | 17 | **13** |

Não é oscilação em torno de um valor: é outra leitura do texto. **41 sentenças
classificadas como opinião viraram 17.** As que saíram de `OPINION` foram para
`UNSOURCED`, e isso derruba os dois termos da fórmula ao mesmo tempo — `FD`
cai e `GAP` sobe.

Ferramenta permanente: `scripts/reprodutibilidade.ts`.

## Consequência desconfortável

**Os três artigos da tabela acima não são medição — são amostragem.** O
agregado de 331 sentenças, os perfis por tipo de artigo, a conclusão de que "a
classificação parece boa": tudo isso foi calculado sobre dados que não se
reproduzem.

A conclusão da ADR — *a régua não discrimina* — pode continuar certa. Mas a
evidência que a sustentava caiu, e hoje **existe exatamente um ponto de dado
confiável**: Moz = 13.

Vale notar que o diagnóstico piora, não melhora: o artigo escolhido como modelo
de bom conteúdo SEO tira **13**, não 24.

## Reprodutibilidade: melhor, não resolvida

Cinco das seis execuções deram 13. Uma deu 21 — e foi também a mais barata
(US$ 0,0135 contra US$ 0,0156), ou seja, produziu menos tokens de saída para as
mesmas 100 sentenças. Há diferença real na resposta, não só no número final.

Seis amostras não caracterizam isso. **Uma em seis análises devolvendo um
número 8 pontos diferente é significativo para um produto que mostra um número.**

## Decisão

### 1. O número de 0 a 100 deixa de ser a figura principal

E não porque escolhemos uma forma melhor — porque sabemos que **esta** está
errada, por razões que independem da distribuição:

- Comunica precisão de unidade que a medição não tem
- Lê-se como nota escolar: "13" sugere conteúdo ruim, quando 13 pode ser o
  normal do formato
- Não acrescenta informação ao breakdown; só embrulha três números em um,
  perdendo o que é acionável

### 2. O breakdown passa a ser a figura principal

*"12% das suas afirmações têm fonte, 69% não têm"* é a medição de verdade. Não
precisa de calibração, não afirma precisão que não existe, e diz ao usuário
exatamente o que mudar. É também o que a [ADR-004](004-honestidade-como-contrato.md)
já exigia ao lado do score — a mudança é de hierarquia, não de conteúdo.

### 3. A forma final do composto fica ADIADA, e isto é deliberado

Faixa nomeada, percentil ou remoção: **nenhuma dessas escolhas é possível com
um ponto de dado.** Qualquer limiar de faixa exige conhecer a distribuição, e a
distribuição que tínhamos era ruído.

O que destrava: rodar o corpus com `temperature: 0`. Barato e definido —
`scripts/reprodutibilidade.ts` e `scripts/calibrate.ts` já existem. Os artigos
grandes custam ~US$ 0,10 cada, então o corpus completo fica em torno de
US$ 0,40.

**Decidir a forma agora, sem distribuição, repetiria exatamente o erro que criou
este problema:** a ADR-003 escolheu pesos "como ponto de partida" e eles viraram
o produto.

## O que sai para o Designer

**Pode desenhar, e não depende de nada pendente:**
- Layout, tipografia, sistema de cores, responsividade
- A tela de entrada, o estado de carregamento, os estados de erro
- **O breakdown das três categorias como figura principal da tela**
- O texto destacado sentença a sentença — o recurso mais acionável do produto
- A ressalva de metodologia (ADR-004), que é contrato

**NÃO pode:**
- Tratar o composto de 0 a 100 como headline
- Apresentá-lo como nota, medalha, semáforo ou qualquer coisa que sugira
  aprovação/reprovação
- Assumir uma escala de faixas — ela não existe ainda
- Desenhar comparação "antes e depois" sobre o composto: com 1 em 6 execuções
  divergindo 8 pontos, a comparação mostraria ruído como progresso

**Deve prever:** um lugar secundário para o composto, cuja forma final será
definida quando a distribuição for medida. Desenhe o espaço, não o número.

## Contrato

`ScoreOutcome` **não muda agora**. O campo `score` continua no payload — ele é
a computação, e removê-lo antes de saber o que o substitui perderia informação
sem ganhar nada.

O que muda é a regra da ADR-004: o número **não pode ser apresentado como
figura principal**, e o breakdown deixa de ser acompanhamento para ser o
resultado. Quando a distribuição existir, o contrato provavelmente ganha um
campo derivado — e aí sim isso vira mudança de tipo.

## Trabalho que isto gera

- [ ] Rodar o corpus completo com `temperature: 0` (~US$ 0,40) e obter a
      distribuição real
- [ ] Investigar a execução divergente: menos tokens de saída para o mesmo
      lote sugere resposta diferente, não só número diferente
- [ ] Reavaliar os pesos 0,6 / 0,4 **depois** da distribuição, nunca antes
- [ ] `docs/` e `context-resume.md` citam os números antigos (17, 23, 24) como
      se fossem medição — precisam da ressalva

---

# SEGUNDA EMENDA — a régua discrimina, e a compressão era do classificador

**Data:** 2026-09-01
**Base:** calibração sobre o corpus com `gemini-2.5-flash`, o classificador de produção

## O que mudou

A primeira emenda concluiu que **a régua é comprimida e não discrimina**, e
rebaixou o composto para a ficha técnica por causa disso. A conclusão estava
certa para os dados que existiam, e os dados estavam errados.

Aquela medição usava `claude-haiku-4-5`, e ela dava para todo artigo um número
entre 21 e 25 — quatro pontos de separação entre tipos de texto deliberadamente
diferentes. Com o classificador atual, a mesma fórmula e os mesmos pesos dão:

| artigo | tipo de texto | densidade | lacuna | composto |
|---|---|---|---|---|
| Moz — o que é SEO | pilar de marketing | 2% | 98% | **2** |
| MDN — introdução a JS | documentação técnica | 10% | 89% | **10** |
| Ahrefs — canonical tags | post curto | 11% | 84% | **13** |
| Wikipedia — Transformer | artigo científico | 47% | 53% | **47** |
| Wikipedia — lista de PIB | tabela com fontes | 67% | 33% | **67** |

**Amplitude de 65 pontos**, contra 4. E a ordem tem validade aparente: conteúdo
de marketing embaixo, referência científica em cima, documentação técnica no
meio. Ninguém precisou calibrar peso nenhum para isso aparecer.

## A causa da compressão

Não era a fórmula. Era o classificador anterior contando **menção a entidade
nomeada como se fosse atribuição** — investigado sentença a sentença e
registrado no README. Ele chamava de "com fonte" frases como *"MozBar: a browser
extension showing SEO metrics"*. Como esse erro acontecia em qualquer texto, ele
empurrava todos os artigos para a mesma faixa de densidade, e a fórmula
herdava a compressão sem ter culpa.

É o mesmo padrão que a [ADR-006](006-prefiltro-deixa-de-decidir.md) já havia
registrado: uma conclusão de projeto construída sobre uma medição enviesada.

## O que isto NÃO decide

**Não reabre a apresentação do composto por conta própria.** A primeira emenda o
rebaixou para a ficha técnica, e ele continua lá. Promovê-lo de volta a figura
principal exige mais do que amplitude:

- **Só cinco artigos foram medidos.** A cota gratuita do provedor acabou no meio
  da execução, e os três artigos em PT-BR ficaram de fora. Não há evidência
  entre idiomas.
- **A reprodutibilidade não foi remedida com este classificador.** Entre duas
  execuções do MDN, a densidade deu 6% e depois 10% — cinco contra oito
  sentenças de 82. `temperature: 0` reduz a variação; não a elimina.
- **Faixa nomeada continua sem base.** Amplitude não é o mesmo que distribuição:
  cinco pontos não dizem onde ficam os limiares de "bom" e "ruim", e inventá-los
  agora repetiria o erro que a ADR-003 cometeu com os pesos.

## O que destrava

- Completar o corpus, incluindo PT-BR — cabe na cota de um dia
- Rodar o mesmo artigo N vezes com o classificador atual, para medir a variação
  que sobrou
- **Só então** o Architect decide a forma final: número, faixa, ou permanência
  na ficha técnica

Os pesos 0,6 / 0,4 seguem sendo ponto de partida, e agora há um corpus com
amplitude real para questioná-los — o que a primeira emenda pedia e não tinha.
