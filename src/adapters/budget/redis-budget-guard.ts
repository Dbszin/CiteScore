import { analysisError } from '../../core/domain/errors.js';
import type {
  BudgetDecision,
  BudgetGuard,
} from '../../core/ports/budget-guard.js';
import type { Clock } from '../../core/ports/clock.js';
import type { RedisClient } from '../redis/redis-client.js';
import { isRedisUnavailable } from '../redis/redis-client.js';
import type { ModelPricing } from '../redis/pricing.js';
import type { ClassifierUsage } from '../../core/ports/claim-classifier.js';
import {
  custoMicros,
  diaUtc,
  estimarCustoMicros,
  segundosAteVirarODia,
} from '../redis/pricing.js';

/**
 * TTL do contador diário.
 *
 * 48h, e não 24h: a chave é nomeada pelo dia UTC, então uma chave criada
 * 23:59 precisa sobreviver ao dia inteiro seguinte de ninguém consultá-la
 * antes de sumir sozinha. Folga barata contra contador órfão.
 */
const TTL_DO_CONTADOR_SEGUNDOS = 48 * 60 * 60;

export interface RedisBudgetGuardOptions {
  readonly dailyBudgetMicros: number;
  readonly maxRequestMicros: number;
  readonly pricing: ModelPricing;
  readonly outputRatio: number;
  readonly keyPrefix: string;
}

/**
 * Teto de gasto diário, com contador fora do processo.
 *
 * Duas recusas semanticamente distintas, e a diferença chega ao usuário:
 * "este artigo é caro demais" tem saída — trocar de artigo —, "a cota do dia
 * acabou" não tem.
 */
export class RedisBudgetGuard implements BudgetGuard {
  constructor(
    private readonly client: RedisClient,
    private readonly clock: Clock,
    private readonly options: RedisBudgetGuardOptions,
  ) {}

  chaveDoDia(): string {
    return `${this.options.keyPrefix}:budget:${diaUtc(this.clock)}`;
  }

  /** @throws AnalysisError GUARD_UNAVAILABLE quando o Redis não responde */
  async authorize(estimatedInputTokens: number): Promise<BudgetDecision> {
    const custo = estimarCustoMicros(
      estimatedInputTokens,
      this.options.outputRatio,
      this.options.pricing,
    );

    // Recusa por tamanho vem ANTES de tocar o contador: uma análise que nunca
    // será autorizada não deve consumir orçamento nem sequer temporariamente.
    if (custo > this.options.maxRequestMicros) {
      return {
        allowed: false,
        reason: 'request_too_expensive',
        estimatedInputTokens,
        retryAfterSeconds: null,
      };
    }

    const chave = this.chaveDoDia();

    // PRÉ-COBRANÇA, antes de liberar.
    //
    // Cobrar só depois deixaria N invocações simultâneas lerem o mesmo saldo
    // e se aprovarem todas — o teto seria furado por paralelismo, que é
    // exatamente o cenário de abuso que o guard existe para conter. O
    // incremento atômico do Redis serializa a decisão.
    let acumulado: number;
    try {
      acumulado = await this.client.incrByWithTtl(
        chave,
        custo,
        TTL_DO_CONTADOR_SEGUNDOS,
      );
    } catch (cause) {
      if (isRedisUnavailable(cause)) {
        // FALHA FECHADA: sem saber quanto já foi gasto, não se autoriza gasto.
        throw analysisError('GUARD_UNAVAILABLE', cause);
      }
      throw cause;
    }

    if (acumulado > this.options.dailyBudgetMicros) {
      // DEVOLVE o que acabou de cobrar. Sem isto, cada requisição recusada
      // continuaria consumindo orçamento e o teto se esgotaria sozinho sob
      // ataque — a defesa viraria o ataque.
      await this.devolver(chave, custo);
      return {
        allowed: false,
        reason: 'daily_cap_reached',
        estimatedInputTokens,
        retryAfterSeconds: segundosAteVirarODia(this.clock),
      };
    }

    return {
      allowed: true,
      reason: 'ok',
      estimatedInputTokens,
      retryAfterSeconds: null,
    };
  }

  /**
   * Fecha a reserva (ADR-009).
   *
   * Recalcula o que foi cobrado a partir do MESMO `estimatedInputTokens`
   * passado a `authorize`. Como a precificação é função pura dos mesmos
   * argumentos, o valor é reproduzido exatamente — sem inferir a partir do
   * uso real, que é outro número.
   *
   * Esse detalhe corrige um segundo defeito, mais silencioso: a versão
   * anterior recalculava a pré-cobrança a partir de `usage.inputTokens`, e
   * `countTokens` e a contagem da resposta da API não coincidem. A
   * reconciliação errava um pouco todo dia.
   */
  async settle(
    estimatedInputTokens: number,
    actualUsage: ClassifierUsage | null,
  ): Promise<void> {
    const cobrado = estimarCustoMicros(
      estimatedInputTokens,
      this.options.outputRatio,
      this.options.pricing,
    );

    // `null` significa que NADA foi gasto: a reserva volta integral. É isso
    // que fecha o vetor de negação de serviço — uma sequência de falhas do
    // provedor deixava de consumir o teto sem ter gasto um centavo.
    const real =
      actualUsage === null
        ? 0
        : custoMicros(
            actualUsage.inputTokens +
              actualUsage.cacheCreationInputTokens +
              actualUsage.cacheReadInputTokens,
            actualUsage.outputTokens,
            this.options.pricing,
          );

    const delta = real - cobrado;
    if (delta === 0) return;

    // NUNCA lança: liquidar acontece depois do trabalho, e no caminho de erro
    // uma exceção aqui mascararia a causa original. Falhar deixa a reserva de
    // pé — erra para o lado caro, e a chave expira em 48h.
    await this.ajustar(this.chaveDoDia(), delta, 'liquidação');
  }

  /**
   * A devolução não pode derrubar a resposta: a decisão de recusar já está
   * tomada e é a correta. Falhar aqui deixa o contador alto até a virada do
   * dia — erra para o lado seguro.
   */
  private async devolver(chave: string, micros: number): Promise<void> {
    await this.ajustar(chave, -micros, 'devolução de pré-cobrança');
  }

  private async ajustar(
    chave: string,
    delta: number,
    operacao: string,
  ): Promise<void> {
    try {
      await this.client.incrBy(chave, delta);
    } catch (cause) {
      console.warn(`[citescore] falha na ${operacao}`, {
        chave,
        delta,
        causa: cause instanceof Error ? cause.message : String(cause),
      });
    }
  }
}
