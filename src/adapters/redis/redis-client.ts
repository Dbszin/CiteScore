/**
 * Superfície mínima de Redis que o produto usa.
 *
 * Interface estreita em vez de dependência do tipo concreto do
 * `@upstash/redis`, pelo mesmo motivo que existe `AnthropicLike`: torna a
 * lógica testável sem rede e sem credenciais, e mantém a biblioteca externa
 * a uma troca de distância.
 *
 * Seis operações. Se crescer muito além disso, provavelmente a lógica está
 * vazando para o adapter.
 */
export interface RedisClient {
  /** `null` quando a chave não existe. */
  get(key: string): Promise<string | null>;

  /** Devolve o valor DEPOIS do incremento. Atômico. */
  incrBy(key: string, amount: number): Promise<number>;

  /** Segundos. */
  expire(key: string, seconds: number): Promise<void>;

  /** Segundos restantes. Negativo quando não há TTL ou a chave não existe. */
  ttl(key: string): Promise<number>;

  /**
   * Incremento e expiração numa ida só.
   *
   * Não é conveniência: `incrBy` seguido de `expire` em duas viagens deixa
   * uma janela em que a chave existe sem TTL. Se o processo morrer nessa
   * janela, o contador fica órfão para sempre — e um contador de teto diário
   * que nunca expira bloqueia o produto no dia seguinte.
   */
  incrByWithTtl(key: string, amount: number, ttlSeconds: number): Promise<number>;

  /**
   * Grava com expiração numa ida só.
   *
   * Mesma razão de `incrByWithTtl`: `set` seguido de `expire` deixa uma janela
   * em que a chave existe SEM TTL. Aqui a consequência é diferente e pior — um
   * resultado de análise sem expiração fica servido para sempre, e o usuário
   * que corrigiu o próprio texto nunca mais veria a medição nova.
   */
  setWithTtl(key: string, value: string, ttlSeconds: number): Promise<void>;
}

/**
 * O Redis não respondeu.
 *
 * Tipo próprio, e não um erro genérico, porque a decisão que ele dispara é
 * específica: as guardas falham FECHADAS. "Não consegui decidir" e "decidi
 * que não" são coisas diferentes, e a diferença precisa sobreviver até a
 * borda HTTP.
 */
export class RedisUnavailableError extends Error {
  readonly isRedisUnavailable = true;

  constructor(
    readonly operation: string,
    override readonly cause?: unknown,
  ) {
    super(`Redis indisponível durante ${operation}`);
    this.name = 'RedisUnavailableError';
  }
}

export function isRedisUnavailable(value: unknown): value is RedisUnavailableError {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { isRedisUnavailable?: boolean }).isRedisUnavailable === true
  );
}
