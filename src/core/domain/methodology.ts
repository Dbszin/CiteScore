/**
 * ADR-004: a natureza estimada do score é campo OBRIGATÓRIO do contrato,
 * não texto de UI.
 *
 * Ressalva que vive só na UI morre em três movimentos previsíveis: um
 * redesign que "limpa" a tela, um print que corta o rodapé, uma landing
 * page nova escrita por outra pessoa. O produto passa a afirmar algo que
 * nunca mediu, e ninguém decidiu mentir — simplesmente aconteceu.
 *
 * `kind` é literal fechado de propósito: publicar uma resposta que se
 * apresente como medição exige alterar o tipo, o que é visível em review.
 */
export interface Methodology {
  readonly kind: 'heuristic_proxy';
  readonly measuredCitations: false;
  readonly disclaimer: string;
  readonly methodologyUrl: string;
}

export const DISCLAIMER_PT_BR =
  'Este score mede densidade factual — a proporção de afirmações sustentadas ' +
  'por dado ou fonte no texto. Ele é uma estimativa derivada dessa medição, ' +
  'não uma medição de citações reais em motores de AI. Não consultamos ' +
  'ChatGPT, Perplexity ou AI Overviews para verificar se este conteúdo é ' +
  'efetivamente citado.';

export function buildMethodology(methodologyUrl: string): Methodology {
  return {
    kind: 'heuristic_proxy',
    measuredCitations: false,
    disclaimer: DISCLAIMER_PT_BR,
    methodologyUrl,
  };
}
