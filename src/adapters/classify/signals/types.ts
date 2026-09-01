/**
 * Sinais do pré-filtro determinístico (ADR-002).
 *
 * Vivem como DADOS versionados, não espalhados em condicionais: ajustar
 * calibração é editar tabela, não caçar regex pelo código.
 */

export type SignalKind =
  // pró-fonte
  | 'source_quantity'
  | 'source_date'
  | 'source_attribution'
  | 'source_quote'
  // pró-opinião
  | 'opinion_first_person'
  | 'opinion_imperative'
  | 'opinion_adjective'
  // hedge — nunca decide sozinho, só escala
  | 'hedge_modal'
  | 'hedge_vague_quantifier'
  | 'hedge_false_authority'
  // desqualificador — anula um sinal pró-fonte que casou por engano
  | 'attribution_disqualifier';

export interface Signal {
  readonly name: string;
  readonly kind: SignalKind;
  readonly pattern: RegExp;
}

export interface SignalTable {
  readonly language: string;
  readonly signals: readonly Signal[];
}

export const SOURCE_KINDS: readonly SignalKind[] = [
  'source_quantity',
  'source_date',
  'source_attribution',
  'source_quote',
];

/**
 * Dos três, apenas `opinion_first_person` DECIDE uma classificação
 * (caso 2 de ADR-002). `opinion_imperative` e `opinion_adjective` são
 * coletados para aparecer em `Classification.signals` e alimentar a
 * explicação na UI — "por que esta sentença foi marcada assim" —, mas não
 * influenciam a decisão do pré-filtro.
 *
 * Isso é deliberado: adjetivo avaliativo e recomendação imperativa aparecem
 * com frequência em prosa técnica neutra ("é fundamental entender que..."),
 * e decidir OPINION a partir deles produziria falso positivo.
 */
export const OPINION_KINDS: readonly SignalKind[] = [
  'opinion_first_person',
  'opinion_imperative',
  'opinion_adjective',
];

/**
 * TODOS os tipos, em tempo de execucao.
 *
 * `SignalKind` e' um tipo, e tipo nao existe depois da compilacao — entao nao
 * havia como um teste perguntar "a pagina de metodologia lista todos os
 * sinais?". O `Record<SignalKind, true>` resolve: acrescentar um tipo a uniao
 * QUEBRA A COMPILACAO ate' ser acrescentado aqui tambem.
 *
 * E' o mesmo mecanismo que `HTTP_STATUS` usa para o mapa de erro, e pela mesma
 * razao: um caso novo escapando por omissao e' o tipo de degradacao que
 * ninguem percebe.
 */
const COBERTURA_DE_TIPOS: Record<SignalKind, true> = {
  source_quantity: true,
  source_date: true,
  source_attribution: true,
  source_quote: true,
  opinion_first_person: true,
  opinion_imperative: true,
  opinion_adjective: true,
  hedge_modal: true,
  hedge_vague_quantifier: true,
  hedge_false_authority: true,
  attribution_disqualifier: true,
};

export const ALL_SIGNAL_KINDS = Object.keys(COBERTURA_DE_TIPOS) as SignalKind[];

export const HEDGE_KINDS: readonly SignalKind[] = [
  'hedge_modal',
  'hedge_vague_quantifier',
  'hedge_false_authority',
];
