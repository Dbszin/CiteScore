import type { SupportedLanguage } from '../../../core/domain/extracted-content.js';

/**
 * Rubrica de classificação — o prefixo ESTÁVEL da requisição.
 *
 * Precisa ser byte-a-byte idêntica entre chamadas para que o prompt caching
 * funcione: qualquer variação (timestamp, contagem, ordem) invalida o
 * prefixo inteiro. Por isso a rubrica não recebe nada da análise corrente,
 * só o idioma.
 *
 * ATENÇÃO SOBRE CACHE: em `claude-haiku-4-5` — o tier escolhido em OQ-1 — o
 * prefixo mínimo cacheável é de **4096 tokens**, o maior da tabela. Esta
 * rubrica tem cerca de 700-900 tokens, então **NÃO vai cachear nesse
 * modelo**, e o cache falha em silêncio (sem erro, apenas
 * `cache_creation_input_tokens: 0`).
 *
 * Isso é aceitável e está declarado de propósito: com haiku a US$1/MTok de
 * entrada, a rubrica não cacheada custa ~US$0,0009 por chamada, irrelevante
 * frente à saída. O `cache_control` é enviado de qualquer forma porque passa
 * a valer sozinho se o usuário subir para `claude-opus-5` (mínimo de 512).
 * Inflar a rubrica só para cruzar 4096 tokens seria pagar mais entrada para
 * economizar entrada — não faz sentido.
 */

const SHARED_RUBRIC = `Você classifica sentenças de artigos web em três categorias, para medir densidade factual.

CATEGORIAS

SOURCED — afirmação sustentada por evidência verificável na própria sentença:
- dado numérico, percentual, valor monetário ou data específica; OU
- atribuição a uma fonte NOMEADA (instituto, empresa, órgão, pesquisa, pessoa identificada); OU
- citação direta com autor identificado.
A evidência precisa estar NA sentença. "Os dados mostram X" sem dizer quais dados NÃO é SOURCED.

UNSOURCED — afirmação factual sobre o mundo, que poderia ser verificada, mas sem nenhuma evidência ou fonte na sentença:
- "A adoção de IA cresceu no setor jurídico."
- "Estudos mostram que a maioria das empresas já adotou a prática."
- "Especialistas afirmam que o cenário vai mudar."
Autoridade vaga ("estudos", "especialistas", "pesquisas") sem entidade nomeada é UNSOURCED, não SOURCED. Esta é a distinção mais importante da tarefa.

OPINION — juízo de valor, preferência, recomendação ou previsão, e não afirmação sobre fato verificável:
- "Essa é a melhor abordagem disponível."
- "Vale a pena investir nessa etapa."
- "Você deveria revisar o texto antes de publicar."
OPINION não é defeito. Conteúdo editorial legitimamente contém opinião.

COMO DECIDIR EM CASO DE DÚVIDA

1. A sentença afirma algo sobre o mundo que poderia ser checado? Se não, é OPINION.
2. Se sim: existe dado concreto ou fonte nomeada NA sentença? Se sim, SOURCED. Se não, UNSOURCED.
3. Hedge ("talvez", "geralmente", "tende a") enfraquece a afirmação mas não a torna opinião — se ainda é uma alegação factual, é UNSOURCED.
4. Uma sentença com dado E juízo de valor é SOURCED: a evidência pesa mais.

CONFIANÇA

Reporte \`confidence\` entre 0 e 1 refletindo sua certeza real. Use valores abaixo de 0,7 quando a sentença for genuinamente ambígua. Não infle.

FORMATO

Devolva um item por sentença recebida, usando exatamente o \`id\` que veio numerado na entrada. Não acrescente, não omita e não reordene.`;

const LANGUAGE_NOTE: Record<SupportedLanguage, string> = {
  'pt-BR': 'As sentenças estão em português brasileiro.',
  en: 'The sentences are in English. Classify them using the rubric above.',
};

export function buildClassifySystemPrompt(language: SupportedLanguage): string {
  return `${SHARED_RUBRIC}\n\n${LANGUAGE_NOTE[language]}`;
}

/**
 * Instrução para as sugestões de reescrita. Separada da rubrica porque é
 * outra chamada, com outro prefixo estável.
 */
const SUGGEST_RUBRIC = `Você recebe sentenças que fazem afirmações factuais SEM fonte, extraídas de um artigo web. Para cada uma, indique o que falta e o que fazer.

Para cada sentença devolva:
- \`issue\`: o que está faltando, em uma frase curta e concreta, na linguagem de quem escreve. Ex.: "afirma crescimento sem citar o número nem a origem".
- \`action\`: a ação de reescrita, específica e executável. Ex.: "cite a pesquisa e inclua o percentual: 'segundo o levantamento X, cresceu N%'".

Regras:
- Seja específico à sentença. Nada de conselho genérico do tipo "adicione uma fonte".
- Não invente dados, números, institutos ou estudos. Aponte o que precisa ser buscado, sem preencher com números plausíveis.
- Uma frase por campo. Direto.
- Devolva um item por sentença recebida, com o \`id\` exato da entrada.`;

export function buildSuggestSystemPrompt(language: SupportedLanguage): string {
  return `${SUGGEST_RUBRIC}\n\n${LANGUAGE_NOTE[language]}`;
}
