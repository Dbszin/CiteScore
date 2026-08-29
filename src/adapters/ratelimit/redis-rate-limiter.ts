import { analysisError } from '../../core/domain/errors.js';
import type { Clock } from '../../core/ports/clock.js';
import type {
  RateLimitDecision,
  RateLimiter,
} from '../../core/ports/rate-limiter.js';
import type { RedisClient } from '../redis/redis-client.js';
import { isRedisUnavailable } from '../redis/redis-client.js';

const UMA_HORA_EM_SEGUNDOS = 3_600;

export interface RedisRateLimiterOptions {
  readonly requestsPerHour: number;
  /** Permite compartilhar uma instância Redis entre ambientes sem colisão. */
  readonly keyPrefix: string;
}

/**
 * Rate limit por cliente, com contador FORA do processo.
 *
 * Contador em memória não serve em serverless: cada invocação pode ser um
 * processo novo, e instâncias paralelas não se enxergam. Um limite em memória
 * na Vercel dá a sensação de proteção sem a proteção — pior que não ter.
 *
 * **Janela FIXA horária**, não deslizante. O trade-off é declarado: na virada
 * da hora cabe uma rajada de até 2x o limite. Para uma defesa cujo objetivo é
 * impedir consumo SUSTENTADO isso é irrelevante — 20 análises custam ~US$0,31,
 * e o teto diário continua sendo o limite real de gasto. Janela deslizante
 * custaria estrutura maior e mais idas ao Redis por requisição, comprando
 * precisão que este produto não precisa.
 */
export class RedisRateLimiter implements RateLimiter {
  constructor(
    private readonly client: RedisClient,
    private readonly clock: Clock,
    private readonly options: RedisRateLimiterOptions,
  ) {}

  private chave(clientKey: string): string {
    const janela = Math.floor(this.clock.now() / (UMA_HORA_EM_SEGUNDOS * 1_000));
    return `${this.options.keyPrefix}:rl:${clientKey}:${janela}`;
  }

  /** @throws AnalysisError GUARD_UNAVAILABLE quando o Redis não responde */
  async check(clientKey: string): Promise<RateLimitDecision> {
    const chave = this.chave(clientKey);

    let usadas: number;
    try {
      usadas = await this.client.incrByWithTtl(chave, 1, UMA_HORA_EM_SEGUNDOS);
    } catch (cause) {
      if (isRedisUnavailable(cause)) {
        // FALHA FECHADA. Servir sem limite justamente quando não sabemos
        // quanto já foi consumido transformaria a indisponibilidade do Redis
        // num jeito de desligar a defesa — e o free tier tem limite de
        // requisições, então provocá-la é viável.
        throw analysisError('GUARD_UNAVAILABLE', cause);
      }
      throw cause;
    }

    const restantes = Math.max(0, this.options.requestsPerHour - usadas);
    if (usadas <= this.options.requestsPerHour) {
      return { allowed: true, remaining: restantes, retryAfterSeconds: null };
    }

    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: await this.segundosAteAJanelaVirar(chave),
    };
  }

  /**
   * Vem do TTL real da chave, não de um valor fixo: dizer "tente em 3600s"
   * a quem esbarrou no limite faltando 20 segundos para a virada é mandar
   * embora quem já podia voltar.
   */
  private async segundosAteAJanelaVirar(chave: string): Promise<number> {
    try {
      const restante = await this.client.ttl(chave);
      return restante > 0 ? restante : UMA_HORA_EM_SEGUNDOS;
    } catch {
      // O limite já foi decidido; não vale derrubar a resposta por causa do
      // cabeçalho. Cai no tamanho da janela.
      return UMA_HORA_EM_SEGUNDOS;
    }
  }
}
