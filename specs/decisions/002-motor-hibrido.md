# ADR-002 — Motor híbrido: pré-filtro determinístico + LLM nos casos ambíguos

- **Data:** 2026-08-27
- **Status:** aceita
- **Contexto do change:** [001-analisador-densidade-factual](../changes/001-analisador-densidade-factual/)

## Contexto

Classificar cada sentença de um artigo em três categorias pode ser feito de três formas:

1. **LLM puro** — manda todas as sentenças para o modelo. Melhor qualidade em nuance, mas paga por cada sentença, inclusive por aquelas cuja classificação é óbvia.
2. **Regras puras** — regex e heurísticas. Grátis e instantâneo, mas raso: não distingue *"a maioria dos especialistas concorda"* (afirmação sem fonte disfarçada de consenso) de *"78% dos especialistas ouvidos pela pesquisa X concordam"*.
3. **Híbrido** — regras resolvem o barato e o óbvio, LLM resolve o ambíguo.

O usuário escolheu híbrido no discovery. Esta ADR define **o que** conta como óbvio e **qual** é o critério de escalonamento — a pergunta que ficou aberta.

## Decisão

O `HybridClassifier` compõe dois classificadores por trás da mesma porta `ClaimClassifier`. O pré-filtro roda primeiro sobre todas as sentenças e produz, para cada uma, um veredito com confiança. Só o que ficar abaixo do limiar vai para o LLM.

### Sinais do pré-filtro

**Pró-fonte** (empurram para `SOURCED`):

- Quantidade com unidade ou percentual — `78%`, `R$ 4,2 mi`, `312 mil`, `1,8 kg`
- Data ou ano explícito — `2024`, `março de 2023`
- Link para domínio externo dentro da sentença
- Atribuição nomeada — *segundo*, *de acordo com*, *dados do/da*, *pesquisa da*, *estudo de*, *relatório do*, seguido de entidade nomeada
- Citação direta com atribuição

**Pró-opinião** (empurram para `OPINION`):

- Primeira pessoa avaliativa — *eu acho*, *acredito*, *na minha opinião*, *para mim*
- Recomendação imperativa — *você deve*, *recomendamos*, *vale a pena*
- Adjetivo avaliativo sem quantificação — *incrível*, *essencial*, *revolucionário*, *o melhor*

**Marcadores de hedge** (empurram para o LLM, nunca decidem sozinhos):

- *talvez*, *possivelmente*, *pode ser que*, *tende a*, *geralmente*
- Quantificador vago — *muitos*, *a maioria*, *diversos*, *vários*
- **Falsa autoridade** — *estudos mostram*, *especialistas dizem*, *pesquisas indicam*, sem entidade nomeada

O último grupo é o coração do produto. *"Estudos mostram que X"* é exatamente a afirmação que parece sustentada e não é. Regra nenhuma decide isso com segurança, e é por isso que o LLM existe neste desenho.

### Critério de escalonamento

O pré-filtro decide sozinho apenas em dois casos de alta confiança:

- **`SOURCED` direto** — a sentença tem sinal pró-fonte forte (quantidade **ou** data **e** atribuição nomeada; ou link externo **e** atribuição nomeada) **e** nenhum marcador de hedge.
- **`OPINION` direto** — a sentença tem sinal de primeira pessoa avaliativa **e** nenhum sinal pró-fonte.

**Todo o resto escala para o LLM.** Em particular, `UNSOURCED` **nunca** é decidido por regra: afirmar que uma sentença é uma afirmação sem fonte exige entender se ela é uma afirmação, e regra não faz isso de forma confiável. Essa é a categoria acionável do produto — errar nela é errar exatamente no que o usuário vai ler e agir.

Toda classificação carrega `decidedBy` (`rules` ou `llm`) e `confidence`. Sem esses dois campos a calibração de M2 é impossível: não haveria como saber se um erro veio da regra ou do modelo.

### Meta operacional

**≤50% das sentenças analisáveis escalam para o LLM.** Se a taxa medida ficar acima disso, o híbrido não está pagando seu custo de complexidade, e a resposta é fortalecer os sinais do pré-filtro — não aceitar o custo.

A taxa é medida e reportada por `scripts/calibrate.ts`. É um número observado, não uma promessa: artigos de opinião podem escalar muito mais que artigos de dados, e isso em si é informação de produto.

## Consequências

**Positivas**

- Custo por análise cai proporcionalmente à taxa de resolução por regra.
- As sentenças mais fáceis nunca pagam latência de rede.
- `decidedBy` dá observabilidade sobre qual metade do motor está errando.
- Regras são explicáveis: dá para mostrar ao usuário *por que* a sentença foi marcada.

**Negativas**

- Duas fontes de verdade para a mesma decisão. Um sinal mal calibrado no pré-filtro produz erro silencioso e confiante — pior que um erro do LLM, porque não passa por revisão.
- Tabelas de sinais são dependentes de idioma. Cada idioma novo é trabalho novo, e é por isso que o v1 se limita a PT-BR e EN.
- O limiar entre óbvio e ambíguo é um chute até M2 medir.

**Mitigação:** os sinais vivem em `src/adapters/classify/signals/` como dados versionados, não espalhados em condicionais. Ajustar calibração é editar tabela, não caçar regex pelo código.

## Alternativas rejeitadas

- **LLM puro.** Rejeitado pelo custo em endpoint público sem login — o pior cenário de abuso fica proporcional ao número de sentenças, sem nenhum piso barato.
- **Regras puras.** Rejeitado por não distinguir falsa autoridade de autoridade real, que é justamente o insight que o produto vende.
- **Uma chamada de LLM por sentença.** Rejeitado por overhead de centenas de round-trips por análise. As sentenças escaladas vão em lote numa única chamada — ver [ADR-005](005-modelo-llm-e-custo.md).
