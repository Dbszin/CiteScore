import type { SignalTable } from './types.js';

/**
 * Tabela de sinais PT-BR (ADR-002).
 *
 * O grupo `hedge_false_authority` é o coração do produto: "estudos mostram
 * que X" é exatamente a afirmação que PARECE sustentada e não é. Regra
 * nenhuma decide isso com segurança — por isso ela apenas escala ao LLM.
 */
export const PT_BR_SIGNALS: SignalTable = {
  language: 'pt-BR',
  signals: [
    // ─── pró-fonte ────────────────────────────────────────────────────────
    {
      name: 'quantidade_com_unidade',
      kind: 'source_quantity',
      // Duas correções acumuladas neste padrão, ambas achadas por teste:
      //
      // 1. O `\b` fica DENTRO da alternação, só nas unidades alfabéticas.
      //    Um `\b` no fim do padrão inteiro nunca casa depois de `%`, porque
      //    `%` não é caractere de palavra — o efeito era que percentual, o
      //    sinal de fonte mais comum em SEO, jamais era detectado.
      //
      // 2. O número aceita AS DUAS formas: com separador de milhar
      //    (`1.500`) e sem (`1500`). A versão anterior era
      //    `\d{1,3}(?:\.\d{3})*`, que EXIGIA o separador — então "1200%" e
      //    "1500 pontos" não casavam, embora "78%" e "1.500 pontos"
      //    casassem. Número sem separador é a forma mais comum na web.
      //
      // Unidades de uma letra ('g', 'm') ficaram fora: casariam com ruído.
      pattern:
        /\b(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?\s*(?:%|(?:por\s?cento|mil|mi|bi|tri|milh(?:ão|ões)|bilh(?:ão|ões)|trilh(?:ão|ões)|reais|d[óo]lares|euros|kg|km|cm|mm|ton|litros?|horas?|minutos?|dias?|meses|anos?|pontos?)\b)/iu,
    },
    {
      name: 'valor_monetario',
      kind: 'source_quantity',
      pattern: /(?:R\$|US\$|€|£)\s?\d/u,
    },
    {
      name: 'ano_ou_data',
      kind: 'source_date',
      pattern:
        /\b(?:(?:19|20)\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4}|(?:janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+de\s+\d{4})\b/iu,
    },
    {
      name: 'atribuicao_nomeada',
      kind: 'source_attribution',
      // Exige entidade nomeada (maiúscula ou sigla) depois do conector.
      // Artigos e preposições entre o conector e a entidade são opcionais:
      // "Segundo o IBGE" e "De acordo com a Serasa" precisam casar.
      // Sem flag `i`: a entidade nomeada PRECISA ser maiúscula, senão
      // "segundo o relatório" (sem fonte) casaria. O conector traz as duas
      // caixas explicitamente, porque começo de frase vem capitalizado.
      pattern:
        /\b(?:[Ss]egundo|[Cc]onforme|[Dd]e\s+acordo\s+com|[Dd]ados?\s+d[oa]s?|[Pp]esquisa\s+d[oa]s?|[Ee]studo\s+d[oa]s?|[Rr]elat[óo]rio\s+d[oa]s?|[Ll]evantamento\s+d[oa]s?|[Cc]enso\s+d[oa]s?)\s+(?:(?:[oa]s?|d[oa]s?)\s+)*(?:[A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wÀ-ÿ]*|[A-Z]{2,})/u,
    },
    {
      // ==== DESQUALIFICADOR (correção do falso positivo confiante) ====
      //
      // "No Segundo Trimestre de 2024, a empresa cresceu bastante." era
      // classificada SOURCED por regra, com confiança 0.92 e SEM FONTE:
      // `[Ss]egundo` casava o ORDINAL em title case como se fosse a
      // PREPOSIÇÃO de atribuição. Erro que empurra o score para cima, e
      // decidido por regra — sem passar pela revisão do LLM. É o pior tipo
      // de erro que a ADR-002 descreve.
      //
      // A regra é gramatical, não uma lista de exceções: em português, a
      // preposição "segundo" NUNCA é precedida de artigo ou de preposição
      // contraída com artigo. "O Segundo", "No Segundo", "do Segundo" só
      // podem ser o ordinal. A segunda alternativa cobre o ordinal em
      // início de frase, onde não há determinante antes.
      name: 'segundo_ordinal_nao_atribuicao',
      kind: 'attribution_disqualifier',
      pattern:
        /\b(?:[oa]s?|n[oa]s?|d[oa]s?|um|uma|ao|à|pel[oa]s?)\s+[Ss]egundo\b|\b[Ss]egundo\s+(?:Trimestre|Semestre|Bimestre|Quadrimestre|Ano|M[êe]s|Dia|Lugar|Colocado|Boletim|Cap[íi]tulo|Volume|Edi[çc][ãa]o|Turno|Tempo|Round|Passo|Item|Par[áa]grafo|Governo|Mandato|Grau|Andar|Piso)\b/u,
    },
    {
      name: 'citacao_atribuida',
      kind: 'source_quote',
      pattern:
        /["“][^"”]{15,}["”]\s*,?\s*(?:disse|afirmou|declarou|explicou|escreveu|comentou)\b/iu,
    },

    // ─── pró-opinião ──────────────────────────────────────────────────────
    {
      name: 'primeira_pessoa_avaliativa',
      kind: 'opinion_first_person',
      pattern:
        /\b(?:eu\s+(?:acho|acredito|penso|prefiro|gosto)|acredito\s+que|na\s+minha\s+opini[ãa]o|a\s+meu\s+ver|para\s+mim|no\s+meu\s+entender|confesso\s+que)\b/iu,
    },
    {
      name: 'recomendacao_imperativa',
      kind: 'opinion_imperative',
      pattern:
        /\b(?:voc[êe]\s+(?:deve|deveria|precisa|tem\s+que)|recomend(?:o|amos)|sugiro|vale\s+a\s+pena|n[ãa]o\s+deixe\s+de|invista\s+em)\b/iu,
    },
    {
      name: 'adjetivo_avaliativo',
      kind: 'opinion_adjective',
      pattern:
        /\b(?:incr[íi]vel|revolucion[áa]ri[oa]|essencial|fundamental|imperd[íi]vel|impressionante|maravilhos[oa]|fant[áa]stic[oa]|o\s+melhor|a\s+melhor|o\s+pior|a\s+pior|surpreendente)\b/iu,
    },

    // ─── hedge (só escala) ────────────────────────────────────────────────
    {
      name: 'modal_incerto',
      kind: 'hedge_modal',
      pattern:
        /\b(?:talvez|possivelmente|provavelmente|pode\s+ser\s+que|tende\s+a|costuma\s+ser|geralmente|normalmente|em\s+geral|aparentemente)\b/iu,
    },
    {
      name: 'quantificador_vago',
      kind: 'hedge_vague_quantifier',
      pattern:
        /\b(?:muitos|muitas|a\s+maioria|grande\s+parte|diversos|diversas|v[áa]ri[oa]s|alguns|algumas|poucos|in[úu]mer[oa]s|boa\s+parte)\b/iu,
    },
    {
      name: 'falsa_autoridade',
      kind: 'hedge_false_authority',
      // Conector de autoridade SEM entidade nomeada. O coração do produto.
      pattern:
        /\b(?:estudos?\s+(?:mostram?|indicam?|apontam?|comprovam?|sugerem?)|pesquisas?\s+(?:mostram?|indicam?|apontam?|revelam?)|especialistas?\s+(?:dizem?|afirmam?|apontam?|recomendam?)|dados\s+(?:mostram?|indicam?)|sabe-se\s+que|é\s+comprovado\s+que|todo\s+mundo\s+sabe)\b/iu,
    },
  ],
};
