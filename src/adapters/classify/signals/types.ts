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

export const HEDGE_KINDS: readonly SignalKind[] = [
  'hedge_modal',
  'hedge_vague_quantifier',
  'hedge_false_authority',
];
