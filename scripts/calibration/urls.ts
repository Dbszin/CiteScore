/**
 * Corpus de calibração — acceptance criteria de M2.
 *
 * Selecionado de `docs/research/golden-dataset-candidates-2026-08-27.md`,
 * com um filtro: aquele documento contém URLs com data fictícia
 * (`.../2024/03/15/...`) e placeholders explícitos
 * (`piaui.folha.uol.com.br/materia/algum-artigo/`). São candidatas escritas
 * sem verificação, não links conferidos. Aqui ficam apenas páginas pilares
 * estáveis, que têm chance real de responder.
 *
 * `expectativa` registra o que o artigo DEVERIA produzir. Não é usado pelo
 * código — existe para a conferência manual: comparar o que o motor achou
 * com o que se esperava é o que transforma números em julgamento.
 */

export interface CorpusEntry {
  readonly id: string;
  readonly url: string;
  readonly lang: 'pt-BR' | 'en';
  readonly tipo: string;
  readonly expectativa: string;
}

export const CORPUS: readonly CorpusEntry[] = [
  // ─── EN ────────────────────────────────────────────────────────────────
  {
    id: 'en-seo-ahrefs',
    url: 'https://ahrefs.com/blog/seo-meta-tags/',
    lang: 'en',
    tipo: 'MIX',
    expectativa: 'mistura de dado e hedge; score intermediário',
  },
  {
    id: 'en-seo-moz',
    url: 'https://moz.com/learn/seo/what-is-seo',
    lang: 'en',
    tipo: 'A-dominante',
    expectativa: 'página pilar com definições e dados; densidade alta',
  },
  {
    id: 'en-tech-mdn',
    url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Introduction',
    lang: 'en',
    tipo: 'B-dominante',
    expectativa: 'doc técnica: muitas afirmações sem fonte, poucas com dado',
  },
  {
    id: 'en-wiki-transformer',
    url: 'https://en.wikipedia.org/wiki/Transformer_(deep_learning_architecture)',
    lang: 'en',
    tipo: 'A-dominante',
    expectativa: 'enciclopédia com citação acadêmica; referência de A perfeito',
  },
  {
    id: 'en-lista-wikipedia',
    url: 'https://en.wikipedia.org/wiki/List_of_countries_by_GDP_(nominal)',
    lang: 'en',
    tipo: 'LISTA-TABELA',
    expectativa: 'stress test de segmentação em lista densa',
  },
  {
    id: 'en-curto-ahrefs',
    url: 'https://ahrefs.com/blog/canonical-tags/',
    lang: 'en',
    tipo: 'CURTO',
    expectativa: 'artigo curto; valida que ainda há análise válida',
  },

  // ─── PT-BR ─────────────────────────────────────────────────────────────
  {
    id: 'pt-seo-rdstation',
    // ⚠️ SOFT 404: esta URL responde HTTP 200 com uma pagina "404: This
    // page could not be found". O conteudo saiu do ar sem o servidor
    // admitir. Verificado de novo em 2026-09-01 — segue 200 com 28 KB de
    // casca, contra 200-800 KB dos outros fixtures.
    //
    // Fica na lista com o aviso, e nao removida, porque ela e' o caso que
    // motivou a guarda de corpo minimo em `fetch-corpus.ts`. Substituir
    // por outro artigo de SEO em PT-BR e' escolha de corpus, e merece ser
    // feita de proposito em vez de no meio de um conserto.
    url: 'https://resultadosdigitais.com.br/blog/o-que-e-seo/',
    lang: 'pt-BR',
    tipo: 'MIX',
    expectativa: 'blog SEO brasileiro — exatamente o conteúdo do usuário-alvo',
  },
  {
    id: 'pt-seo-neilpatel',
    url: 'https://neilpatel.com/br/seo/',
    lang: 'pt-BR',
    tipo: 'MIX',
    expectativa: 'conteúdo traduzido; lista de técnicas com dados',
  },
  {
    id: 'pt-mkt-rockcontent',
    url: 'https://rockcontent.com/br/blog/marketing-de-conteudo/',
    lang: 'pt-BR',
    tipo: 'MIX',
    expectativa: 'mix de afirmação e opinião',
  },
  {
    id: 'pt-tech-mdn',
    url: 'https://developer.mozilla.org/pt-BR/docs/Web/JavaScript/Guide/Introduction',
    lang: 'pt-BR',
    tipo: 'B-dominante',
    expectativa: 'mesma doc do MDN em PT — compara pré-filtro entre idiomas',
  },
  {
    id: 'pt-wiki-ia',
    url: 'https://pt.wikipedia.org/wiki/Intelig%C3%AAncia_artificial',
    lang: 'pt-BR',
    tipo: 'A-dominante',
    expectativa: 'enciclopédia PT-BR; valida A-dominante em português',
  },
  {
    id: 'pt-lista-rios',
    // A URL anterior (Lista_dos_maiores_rios_do_Brasil) devolve 404 — o
    // indice do corpus registrava isso honestamente e o artigo nunca foi
    // baixado. Esta responde 200 com 158 KB, e serve ao mesmo proposito:
    // uma pagina de LISTA-TABELA em portugues.
    url: 'https://pt.wikipedia.org/wiki/Lista_de_rios_do_Brasil',
    lang: 'pt-BR',
    tipo: 'LISTA-TABELA',
    expectativa: 'stress test PT-BR de lista/tabela',
  },
];
