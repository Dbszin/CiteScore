import { Redis } from '@upstash/redis';

import type { RedisClient } from './redis-client.js';
import { RedisUnavailableError } from './redis-client.js';

/**
 * Cliente sobre a API REST do Upstash.
 *
 * REST, e não o protocolo Redis: a função serverless não mantém conexão TCP
 * viva entre invocações, então um cliente de protocolo reconectaria a cada
 * requisição — o pior dos dois mundos, com o custo do handshake e sem o
 * benefício do pool.
 *
 * Toda falha de transporte vira `RedisUnavailableError`. A distinção importa:
 * as guardas falham FECHADAS quando não conseguem decidir, e para isso
 * precisam saber que o problema foi o Redis, não a lógica.
 */
export class UpstashRedisClient implements RedisClient {
  private readonly redis: Redis;

  constructor(url: string, token: string) {
    this.redis = new Redis({ url, token });
  }

  private async executar<T>(operacao: string, acao: () => Promise<T>): Promise<T> {
    try {
      return await acao();
    } catch (cause) {
      throw new RedisUnavailableError(operacao, cause);
    }
  }

  async get(key: string): Promise<string | null> {
    return this.executar('get', async () => {
      // O Upstash desserializa JSON por conta própria; normalizamos para
      // string porque a interface promete string.
      const valor = await this.redis.get<unknown>(key);
      return valor === null || valor === undefined ? null : String(valor);
    });
  }

  async incrBy(key: string, amount: number): Promise<number> {
    return this.executar('incrBy', () => this.redis.incrby(key, amount));
  }

  async expire(key: string, seconds: number): Promise<void> {
    await this.executar('expire', () => this.redis.expire(key, seconds));
  }

  async ttl(key: string): Promise<number> {
    return this.executar('ttl', () => this.redis.ttl(key));
  }

  async incrByWithTtl(
    key: string,
    amount: number,
    ttlSeconds: number,
  ): Promise<number> {
    return this.executar('incrByWithTtl', async () => {
      // Pipeline: uma ida à rede para as duas operações. `expire` com `NX`
      // aplica TTL apenas quando ainda não há — sem isso, cada incremento
      // empurraria a expiração adiante e o contador nunca venceria sob
      // tráfego contínuo, que é justamente o cenário de abuso.
      const pipeline = this.redis.pipeline();
      pipeline.incrby(key, amount);
      pipeline.expire(key, ttlSeconds, 'NX');
      const [novo] = (await pipeline.exec()) as [number, number];
      return novo;
    });
  }

  async setWithTtl(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.executar('setWithTtl', async () => {
      // `ex` no proprio SET: uma ida, e a chave NUNCA existe sem expiracao.
      // Fazer `set` e depois `expire` deixaria uma janela em que um resultado
      // de analise fica guardado para sempre.
      await this.redis.set(key, value, { ex: ttlSeconds });
    });
  }
}
