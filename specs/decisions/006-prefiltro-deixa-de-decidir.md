# ADR-006 — O pré-filtro deixa de decidir e passa a anotar

- **Data:** 2026-08-28
- **Status:** aceita
- **Relação:** supersede parcialmente [ADR-002](002-motor-hibrido.md)
- **Base:** calibração de 2026-08-28 sobre 2.149 sentenças de 11 artigos reais

## Contexto

A [ADR-002](002-motor-hibrido.md) desenhou um motor híbrido com uma premissa explícita: uma fração significativa das sentenças é **obviamente** classificável por regra, e mandá-las ao LLM seria pagar por trabalho desnecessário. A meta registrada foi de **≥50% resolvidos pelo pré-filtro**, com a observação de que a taxa seria medida, não prometida.

A medição aconteceu. A premissa não se sustenta.

### O que a calibração mediu

Sobre 2.149 sentenças analisáveis de 11 artigos reais em PT-BR e EN:

| Sinal | Ocorrências | % das sentenças |
|---|---|---|
| `source_date` | 375 | 17,4% |
| `hedge_vague_quantifier` | 121 | 5,6% |
| `hedge_modal` | 52 | 2,4% |
| `opinion_imperative` | 28 | 1,3% |
| `source_quantity` | 27 | 1,3% |
| `opinion_adjective` | 19 | 0,9% |
| **`source_attribution`** | **9** | **0,4%** |
| **`opinion_first_person`** | **0** | **0%** |

**O pré-filtro resolveu 0,3% dos casos.** A taxa de escalonamento ao LLM foi de **100%** em todos os artigos processados.

### Por que a premissa falhou

Duas descobertas, ambas estruturais:

1. **A atribuição nomeada aparece em 0,4% das sentenças.** A regra de `SOURCED` direto exige a **conjunção** de atribuição com quantidade ou data na mesma sentença. Quando um dos termos ocorre em 0,4% dos casos, a conjunção é matematicamente quase impossível. Em prosa real a fonte está numa frase e o número em outra — *"Segundo a Serasa, o quadro mudou. Foram 72 milhões de inadimplentes."*

2. **`opinion_first_person` nunca ocorreu.** Zero em 2.149 sentenças. O caso 2 da ADR-002 é código morto em conteúdo profissional: ninguém escreve "eu acho" num artigo de SEO ou numa documentação técnica.

A raiz do erro de projeto: a ADR-002 foi escrita a partir de **sentenças de exemplo**, construídas para ilustrar cada categoria. Sentenças de exemplo contêm marcadores explícitos porque foram escritas para contê-los. Prosa real, não.

### Afrouxar a regra não resolve

Medido sobre o mesmo corpus:

| Variante | Resolve |
|---|---|
| Atual: quantidade **E** atribuição | 0,3% |
| Atribuição sozinha basta | 0,4% |
| Atribuição **OU** quantidade/data | 19,6% |

Nem a variante mais permissiva alcança metade da meta. E ela é uma armadilha: `source_date` sozinho carrega quase toda a diferença, e **data não é fonte**. *"Em 2024 a empresa cresceu"* tem data e nenhuma sustentação. Adotá-la compraria 19% de cobertura produzindo exatamente o erro que a ADR-002 define como o pior possível — a classificação confiante decidida por regra, que não passa pela revisão do LLM.

## Decisão

**O pré-filtro deixa de decidir classificação. Ele passa a anotar sinais.**

- `RulePrefilter` não emite mais veredito. Sua responsabilidade passa a ser detectar e reportar os sinais presentes em cada sentença.
- **Toda decisão de categoria é do LLM.** O motor é LLM puro na classificação.
- Os sinais detectados populam `Classification.signals` para **todas** as sentenças, servindo à explicabilidade na UI — que hoje não existe: 100% das classificações reais têm `signals` vazio.
- A meta de ≥50% de escalonamento é **retirada**. Ela media uma economia que não existe.

### O que isso preserva

As tabelas de sinais **não são descartadas**. Elas continuam valendo por três motivos:

1. **Explicabilidade.** A justificativa por sentença foi removida do schema do LLM por custo ([ADR-005](005-modelo-llm-e-custo.md)); a saída domina 92% da conta. Os sinais são a única fonte gratuita de "por que esta sentença foi marcada assim". Cobrem 28,2% das sentenças — parcial, mas real.
2. **Detecção de falsa autoridade.** `hedge_false_authority` identifica *"estudos mostram"* sem entidade nomeada. É o insight central do produto e vale destacar na UI mesmo sem decidir a categoria.
3. **Contexto para o modelo.** Anotar os sinais na entrada do LLM é uma via aberta para melhorar precisão a custo baixo — entrada custa 1/5 da saída no haiku. Fica registrada como hipótese a testar, não como decisão.

## Consequências

**Positivas**

- Elimina a fonte de erro que a própria ADR-002 classificava como a pior: decisão confiante por regra, sem revisão.
- Remove complexidade que não paga. O pré-filtro decisório acumulou três bugs de regex silenciosos e um falso positivo confiante, tudo para resolver 0,3% dos casos.
- `signals` passa a ser preenchido de verdade, entregando a explicabilidade que a UI precisa.
- O motor fica mais simples de raciocinar: uma fonte de decisão, não duas.

**Negativas**

- **O custo por análise sobe e passa a ser piso, não média.** Com 100% de escalonamento, medido em US$ 0,05 por artigo com `claude-haiku-4-5` — 7x acima da projeção da ADR-005, que assumia 50% de economia. Não há mais economia a esperar do desenho.
- Perde-se a capacidade de medir a distribuição sem gastar. `escalationRate` deixa de fazer sentido.
- `decidedBy` passa a valer sempre `llm`, tornando o campo informativo apenas para histórico. Mantido para auditoria e para o caso de o pré-filtro voltar a decidir sob outra abordagem.

**Mitigação do custo:** as três defesas de [protecao-custo](../changes/001-analisador-densidade-factual/specs/protecao-custo/spec.md) passam a ser ainda mais críticas — rate limit, cap de conteúdo e budget guard eram bloqueadores de deploy e continuam sendo, agora com um piso de custo 7x maior por análise.

## Alternativas rejeitadas

- **Afrouxar para "atribuição OU quantidade/data".** Rejeitada pelos dados: compra 19,6% de cobertura ao preço de tratar data como fonte. Trocar precisão por economia num produto que mede honestidade factual é o pior negócio disponível.
- **Investir em sinais melhores (NER, parsing sintático).** Reconheceria o problema real — a detecção de atribuição precisa de análise linguística, não de regex. Mas seria construir um classificador para evitar usar um classificador. Rejeitada por desproporção.
- **Manter o pré-filtro decisório e aceitar 0,3%.** Rejeitada: mantém toda a complexidade e todo o risco de erro confiante, em troca de nada mensurável.
- **Remover as tabelas de sinais por completo.** Rejeitada: descartaria a única fonte de explicabilidade gratuita, num produto cuja proposta depende de mostrar *por que* uma afirmação é fraca.
