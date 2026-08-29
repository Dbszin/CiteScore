import type { Clock } from '../../core/ports/clock.js';

/**
 * Contabilidade de gasto em MICRO-DÓLARES INTEIROS.
 *
 * Nada de ponto flutuante num contador que decide se o produto atende ou
 * recusa: somar 0,0155 milhares de vezes acumula erro, e o erro fica no teto.
 * Inteiro soma exato, e o Redis incrementa inteiro nativamente.
 *
 * A conversão é conveniente: com preço em dólares por milhão de tokens,
 * `custo_micros = tokens × precoPorMilhao`. Um token de entrada a US$1/MTok
 * custa exatamente 1 micro-dólar.
 */
export const MICROS_POR_DOLAR = 1_000_000;

export interface ModelPricing {
  readonly inputUsdPerMTok: number;
  readonly outputUsdPerMTok: number;
}

export function dolaresParaMicros(dolares: number): number {
  return Math.round(dolares * MICROS_POR_DOLAR);
}

export function microsParaDolares(micros: number): number {
  return micros / MICROS_POR_DOLAR;
}

/** Custo real, quando os dois lados já são conhecidos. */
export function custoMicros(
  inputTokens: number,
  outputTokens: number,
  pricing: ModelPricing,
): number {
  return Math.ceil(
    inputTokens * pricing.inputUsdPerMTok + outputTokens * pricing.outputUsdPerMTok,
  );
}

/**
 * Custo estimado no pré-flight, quando só a entrada é conhecida.
 *
 * A porta `BudgetGuard` recebe apenas tokens de entrada, e contar só isso
 * subestimaria o gasto grosseiramente: na análise real medida a SAÍDA
 * respondeu por 73% do custo, porque custa 5x mais por token.
 *
 * `outputRatio` é a saída como fração da entrada. Medido: 2.261/4.244 = 0,53.
 * O default de produção carrega margem, e a assimetria é intencional — errar
 * para cima recusa uma análise que caberia, errar para baixo fura o teto.
 */
export function estimarCustoMicros(
  inputTokens: number,
  outputRatio: number,
  pricing: ModelPricing,
): number {
  return custoMicros(inputTokens, Math.ceil(inputTokens * outputRatio), pricing);
}

/** Dia UTC, `YYYY-MM-DD`. O teto é diário e precisa de fronteira estável. */
export function diaUtc(clock: Clock): string {
  return new Date(clock.now()).toISOString().slice(0, 10);
}

/**
 * Segundos até a virada do dia UTC — o `Retry-After` honesto para o teto
 * diário, em vez de um "tente amanhã" sem número.
 */
export function segundosAteVirarODia(clock: Clock): number {
  const agora = clock.now();
  const inicioDoDia = Date.UTC(
    new Date(agora).getUTCFullYear(),
    new Date(agora).getUTCMonth(),
    new Date(agora).getUTCDate(),
  );
  const proximoDia = inicioDoDia + 24 * 60 * 60 * 1_000;
  return Math.max(1, Math.ceil((proximoDia - agora) / 1_000));
}
