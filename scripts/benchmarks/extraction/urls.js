// URLs testadas no benchmark de extração
// Mix: idioma (EN/PT-BR), tipo (SEO, técnico, jornalístico, paywall, SPA, lista)

module.exports = [
  {
    id: "en-seo-ahrefs",
    url: "https://ahrefs.com/blog/seo-meta-tags/",
    lang: "en",
    type: "seo-marketing",
    description: "Blog post SEO marketing (Ahrefs) — HTML limpo, conteúdo longo, affiliate/CTAs inline esperados"
  },
  {
    id: "en-seo-moz",
    url: "https://moz.com/learn/seo/what-is-seo",
    lang: "en",
    type: "seo-marketing",
    description: "Página pilar SEO (Moz) — muito texto, links internos, sidebars de marketing"
  },
  {
    id: "en-tech-mdn",
    url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Introduction",
    lang: "en",
    type: "technical-doc",
    description: "Documentação técnica (MDN) — código inline, headings hierárquicos, navegação pesada"
  },
  {
    id: "pt-jornal-folha",
    url: "https://www.folha.uol.com.br/",
    lang: "pt-BR",
    type: "journalistic",
    description: "Home Folha de S.Paulo — paywall na home, boilerplate UOL pesado. Testa fallback parcial"
  },
  {
    id: "pt-jornal-g1",
    url: "https://g1.globo.com/",
    lang: "pt-BR",
    type: "journalistic",
    description: "Home G1 — boilerplate Globo, mais limpa. Testa extração em index de portal"
  },
  {
    id: "en-paywall-nyt",
    url: "https://www.nytimes.com/2025/08/15/business/economy/federal-reserve-interest-rates.html",
    lang: "en",
    type: "paywall",
    description: "Paywall duro (NYT) — deve falhar parcialmente, só ~1-2 parágrafos acessíveis"
  },
  {
    id: "en-spa-vercel",
    url: "https://nextjs.org/blog",
    lang: "en",
    type: "spa-heavy",
    description: "Blog index do Next.js — site moderno SSR/SPA, boilerplate típico de framework docs"
  },
  {
    id: "en-list-wikipedia",
    url: "https://en.wikipedia.org/wiki/List_of_countries_by_GDP_(nominal)",
    lang: "en",
    type: "list-table",
    description: "Lista/tabela densa (Wikipedia) — stress test para sentencização de listas"
  }
];
