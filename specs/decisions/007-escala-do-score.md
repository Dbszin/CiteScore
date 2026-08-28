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
