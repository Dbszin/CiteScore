# Proposal: pré-filtro deixa de decidir; motor passa a LLM puro

## Status
- **State:** active
- **Created:** 2026-08-28
- **Author:** @Dbszin

## Problem Statement

O motor de análise foi desenhado como híbrido: regras determinísticas resolveriam os casos óbvios, e o LLM resolveria os ambíguos. A [ADR-002](../../decisions/002-motor-hibrido.md) registrou a meta de **≥50% resolvidos pelo pré-filtro**, deixando explícito que a taxa seria medida e não prometida.

A calibração mediu. **O pré-filtro resolve 0,3%.**

Isso não é um bug a corrigir. É uma premissa de projeto que a realidade recusou, e mantê-la custa em três frentes:

1. **Complexidade que não paga.** O pré-filtro decisório acumulou três bugs de regex silenciosos e um falso positivo confiante — todos encontrados por teste, nenhum por leitura — para resolver 0,3% dos casos.
2. **Risco de erro confiante.** A ADR-002 define o erro decidido por regra como o pior possível, porque não passa pela revisão do LLM. Manter um mecanismo decisório quase inerte preserva integralmente esse risco em troca de quase nenhum benefício.
3. **Promessa falsa de economia.** O custo real é **US$ 0,05 por artigo**, 7x acima da projeção da ADR-005, que assumia a economia de 50%. Um plano de custo baseado numa economia inexistente dimensiona errado o budget guard.

## Goals

1. **Eliminar a decisão por regra** e tornar o LLM a única fonte de classificação, removendo a categoria de erro que a ADR-002 identificou como a mais grave.
2. **Preservar o investimento nas tabelas de sinais** convertendo-as em anotação — que é o único caminho gratuito para explicabilidade na UI, já que a justificativa por sentença foi cortada por custo.
3. **Fazer `Classification.signals` valer alguma coisa.** Hoje ele está vazio em 100% das classificações reais.
4. **Corrigir o registro de custo** para o valor medido, para que as defesas de M4 sejam dimensionadas sobre o número certo.
5. **Não alterar a fórmula do score** sem base empírica — apenas registrar o diagnóstico e o plano ([ADR-007](../../decisions/007-escala-do-score.md)).

## Non-Goals

- **Redesenhar a detecção de sinais** com NER ou parsing sintático. Resolveria o problema real (atribuição exige análise linguística, não regex), mas seria construir um classificador para evitar usar um classificador.
- **Alterar os pesos 0,6 / 0,4.** Com 3 artigos, todos em inglês, mexer na fórmula repetiria o erro que criou o problema: escolher constante sem dado.
- **Remover as tabelas de sinais.** Elas passam de decisoras a anotadoras, não a lixo.
- **Implementar `ClaudeSuggestionWriter`.** Pendência anterior, fora deste escopo.
- **Mexer em M3 ou M4.**

## Constraints

- **`UNSOURCED` continua nunca sendo decidido por regra** — agora trivialmente, porque nenhuma categoria é.
- **A porta `ClaimClassifier` não muda.** O caso de uso continua sem saber como a classificação é produzida — a propriedade que a [ADR-001](../../decisions/001-arquitetura-hexagonal.md) protege.
- **`src/core/**` segue sem infraestrutura.**
- A mudança toca contrato de domínio (`PrefilterVerdict`), então exige atualização dos testes que o exercitam.

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Remover a decisão por regra elimina a última barreira gratuita e todo erro passa a depender do LLM | Medium | O LLM já decide 100% na prática. A mudança reconhece o que já ocorre, não introduz risco novo |
| `signals` anotados podem induzir o leitor a achar que explicam a decisão, quando o LLM decidiu por conta própria | **High** | A UI deve apresentá-los como "sinais encontrados no texto", nunca como "motivo da classificação". Requisito para o Designer |
| A cobertura de sinais é de 28,2% — a explicabilidade fica parcial | Medium | Melhor que os 0% de hoje. A UI precisa lidar com ausência de sinal sem parecer defeito |
| Custo de US$ 0,05/artigo torna o abuso mais caro | **High** | As três defesas de `protecao-custo` continuam bloqueadoras de deploy, agora dimensionadas sobre o número certo |
| A escala do score segue comprimida e M3 pode ser desenhada sobre régua instável | **High** | ADR-007 registra; o Designer precisa saber antes de desenhar |

## Success Criteria

- [ ] Nenhuma classificação com `decidedBy: 'rules'` é produzida pelo motor.
- [ ] `Classification.signals` vem preenchido para toda sentença em que a tabela detecta algo — verificado em execução real, não em teste com dado construído.
- [ ] A suíte segue verde, com os testes do comportamento removido **deletados**, não desabilitados.
- [ ] `tasks.md` registra a taxa de escalonamento como 100% por desenho, e não mais como meta a atingir.
- [ ] A ADR-005 reflete o custo medido.
- [ ] Nenhuma alteração em `weights.ts` — `SCORE_VERSION` permanece `1.0.0`.
