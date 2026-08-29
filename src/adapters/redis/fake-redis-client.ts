import type { Clock } from '../../core/ports/clock.js';
import type { RedisClient } from './redis-client.js';
import { RedisUnavailableError } from './redis-client.js';

/**
 * Redis em memória, com relógio injetado.
 *
 * É o que permite implementar e testar as guardas inteiras sem credenciais e
 * sem rede — e testes de janela de tempo que não dependem do relógio do
 * sistema, que é o que faz suíte falhar às 23h59.
 *
 * Também simula indisponibilidade, porque a decisão mais importante das
 * guardas é o que fazer quando o Redis cai, e uma decisão sem teste é uma
 * intenção.
 */
export class FakeRedisClient implements RedisClient {
  private readonly valores = new Map<string, number>();
  /** Instante de expiração, em ms. */
  private readonly expiracoes = new Map<string, number>();

  /** Quando true, toda operação lança `RedisUnavailableError`. */
  indisponivel = false;

  /** Contagem de idas ao servidor. Torna a latência observável em teste. */
  operacoes = 0;

  constructor(private readonly clock: Clock) {}

  private garantirDisponivel(operacao: string): void {
    this.operacoes += 1;
    if (this.indisponivel) {
      throw new RedisUnavailableError(operacao);
    }
  }

  /** Expira preguiçosamente, como o Redis de verdade. */
  private expirarSeVencida(key: string): void {
    const vence = this.expiracoes.get(key);
    if (vence !== undefined && this.clock.now() >= vence) {
      this.valores.delete(key);
      this.expiracoes.delete(key);
    }
  }

  async get(key: string): Promise<string | null> {
    this.garantirDisponivel('get');
    this.expirarSeVencida(key);
    const valor = this.valores.get(key);
    return valor === undefined ? null : String(valor);
  }

  async incrBy(key: string, amount: number): Promise<number> {
    this.garantirDisponivel('incrBy');
    this.expirarSeVencida(key);
    const novo = (this.valores.get(key) ?? 0) + amount;
    this.valores.set(key, novo);
    return novo;
  }

  async expire(key: string, seconds: number): Promise<void> {
    this.garantirDisponivel('expire');
    if (this.valores.has(key)) {
      this.expiracoes.set(key, this.clock.now() + seconds * 1_000);
    }
  }

  async ttl(key: string): Promise<number> {
    this.garantirDisponivel('ttl');
    this.expirarSeVencida(key);
    if (!this.valores.has(key)) return -2;
    const vence = this.expiracoes.get(key);
    if (vence === undefined) return -1;
    return Math.ceil((vence - this.clock.now()) / 1_000);
  }

  async incrByWithTtl(
    key: string,
    amount: number,
    ttlSeconds: number,
  ): Promise<number> {
    this.garantirDisponivel('incrByWithTtl');
    this.expirarSeVencida(key);
    const existia = this.valores.has(key);
    const novo = (this.valores.get(key) ?? 0) + amount;
    this.valores.set(key, novo);
    // TTL aplicado só na criação, como no adapter real: reaplicar a cada
    // incremento faria a janela deslizar para sempre e o contador nunca
    // expirar sob tráfego contínuo.
    if (!existia) {
      this.expiracoes.set(key, this.clock.now() + ttlSeconds * 1_000);
    }
    return novo;
  }

  /** Só para teste: inspeção direta, sem passar pelas guardas de disponibilidade. */
  espiar(key: string): number | null {
    this.expirarSeVencida(key);
    return this.valores.get(key) ?? null;
  }
}
