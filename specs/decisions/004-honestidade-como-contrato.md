# ADR-004 — Honestidade do score é contrato de API, não copy de UI

- **Data:** 2026-08-27
- **Status:** aceita
- **Contexto do change:** [001-analisador-densidade-factual](../changes/001-analisador-densidade-factual/)

## Contexto

O produto mede densidade factual e apresenta o resultado como estimativa de citabilidade em motores de AI. Essa correlação **não foi medida por nós** — a decisão de usar um proxy heurístico em vez de medição real foi tomada consciente no discovery, com as duas alternativas postas na mesa.

O risco não é a decisão. O risco é o caminho por onde a ressalva desaparece. Ressalva que vive só como texto de UI morre em três movimentos previsíveis: um redesign que "limpa" a tela, um print para LinkedIn que corta o rodapé, uma landing page nova escrita por outra pessoa. O produto passa a afirmar algo que nunca mediu, e ninguém tomou a decisão de mentir — ela simplesmente aconteceu.

No nicho de SEO isso é especialmente caro: é um mercado saturado de ferramentas que prometem métricas proprietárias sem metodologia. Ser pego nessa categoria é permanente.

## Decisão

A natureza estimada do score é **campo obrigatório do payload de resposta**, com teste que falha se ausente. Não é responsabilidade da UI lembrar.

### Campos obrigatórios em toda resposta bem-sucedida

| Campo | Conteúdo |
|---|---|
| `scoreVersion` | Versão da fórmula (ver [ADR-003](003-formula-do-score.md)) |
| `methodology.kind` | Literal `"heuristic_proxy"` — o tipo é fechado, não string livre |
| `methodology.disclaimer` | Texto afirmando que o score deriva de densidade factual e **não** de citação medida em motores de AI |
| `methodology.measuredCitations` | Literal `false` no v1. O campo existe para que o dia em que houver medição real seja uma mudança de valor, não uma mudança de contrato |
| `breakdown` | Sempre presente. O score nunca viaja sozinho |

`methodology.kind` ser um literal de tipo, e não texto livre, é deliberado: torna impossível publicar uma resposta que se apresente como medição sem alterar o tipo — o que é uma mudança visível em code review.

### Requisitos de apresentação (vinculam o Designer)

1. **A métrica primária se chama "Densidade Factual".** "Estimativa de citabilidade" é leitura secundária e nunca aparece sem qualificador — nunca a palavra "citabilidade" sozinha como rótulo do número.
2. **O score nunca é renderizado sem o breakdown das três categorias no mesmo campo visual.** Número sozinho vira métrica de autoridade.
3. **O disclaimer é conteúdo, não rodapé.** Fica na região do resultado, legível sem scroll, no mesmo nível hierárquico do score.
4. **A metodologia é acessível a um clique** a partir do resultado: quais sinais, como o score é calculado, o que não foi medido.

O item 1 é o que mais protege o produto a longo prazo — porque "Densidade Factual" é uma afirmação que sustentamos. O nome honesto também é o nome defensável.

### O que isto não é

Não é exigência de esconder a proposta de valor. O produto pode e deve afirmar que densidade factual é a hipótese mais forte disponível hoje para citabilidade em AI. A linha é entre **hipótese apresentada como hipótese** e **medição afirmada sem medir**.

## Consequências

**Positivas**

- A ressalva sobrevive a redesign, a screenshot e a troca de quem escreve a copy.
- O caminho para medição real fica aberto sem quebra de contrato: `measuredCitations` vira `true`, `kind` ganha novo valor.
- Diferencia o produto num nicho onde métricas proprietárias sem metodologia são a norma.
- Dá ao Designer um requisito verificável em vez de um pedido vago de "ser honesto".

**Negativas**

- Consome espaço visual valioso na tela de resultado, competindo com o próprio score.
- Um concorrente que simplesmente afirme "medimos citabilidade" vai soar mais forte no anúncio.
- O teste de contrato tem um custo real de manutenção: dá atrito em toda mudança de payload.

O segundo item é o trade-off central e ele é aceito de forma consciente: perder no anúncio é recuperável, ser desmascarado não é.

## Alternativas rejeitadas

- **Disclaimer só como texto de UI.** Rejeitado pelo modo de falha descrito no contexto: desaparece sem ninguém decidir que desapareceu.
- **Renomear o produto para evitar a palavra "cite".** Considerado a sério — o nome CiteScore carrega a promessa que não medimos. Rejeitado porque o nome já existe, o repositório já existe, e o problema é resolvível por nomenclatura de métrica dentro do produto. Fica registrado como reconsiderável se o produto ganhar tração.
- **Medir citação real já no v1.** É a solução honesta de verdade e resolve a ADR inteira. Rejeitada no discovery por custo, latência e fragilidade (ToS, scraping). Está no roadmap.
