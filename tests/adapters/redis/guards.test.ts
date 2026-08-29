import { beforeEach, describe, expect, it } from 'vitest';

import { FixedClock } from '../../../src/adapters/clock/system-clock.js';
import { RedisBudgetGuard } from '../../../src/adapters/budget/redis-budget-guard.js';
import { RedisRateLimiter } from '../../../src/adapters/ratelimit/redis-rate-limiter.js';
import { FakeRedisClient } from '../../../src/adapters/redis/fake-redis-client.js';
import { RedisCostRecorder } from '../../../src/adapters/redis/redis-cost-recorder.js';
import { dolaresParaMicros } from '../../../src/adapters/redis/pricing.js';
import { AnalysisError } from '../../../src/core/domain/errors.js';

/** 2026-08-28T12:00:00Z — meio do dia, para a virada ser previsível. */
const MEIO_DIA = Date.UTC(2026, 7, 28, 12, 0, 0);
const UMA_HORA = 3_600_000;

const PRICING = { inputUsdPerMTok: 1, outputUsdPerMTok: 5 };

async function esperarCodigo(promessa: Promise<unknown>, code: string): Promise<void> {
  await expect(promessa).rejects.toBeInstanceOf(AnalysisError);
  await promessa.catch((error: unknown) => {
    expect((error as AnalysisError).code).toBe(code);
  });
}

describe('RedisRateLimiter', () => {
  let clock: FixedClock;
  let client: FakeRedisClient;
  let limiter: RedisRateLimiter;

  beforeEach(() => {
    clock = new FixedClock(MEIO_DIA);
    client = new FakeRedisClient(clock);
    limiter = new RedisRateLimiter(client, clock, {
      requestsPerHour: 3,
      keyPrefix: 'teste',
    });
  });

  it('libera até o limite e recusa a partir dele', async () => {
    for (let i = 0; i < 3; i += 1) {
      const decisao = await limiter.check('1.2.3.4');
      expect(decisao.allowed, `requisição ${i + 1}`).toBe(true);
    }
    const quarta = await limiter.check('1.2.3.4');
    expect(quarta.allowed).toBe(false);
  });

  it('o Retry-After vem do TTL real, não de um valor fixo', async () => {
    for (let i = 0; i < 4; i += 1) await limiter.check('1.2.3.4');
    clock.advance(UMA_HORA - 20_000); // faltam 20s para a janela virar

    const decisao = await limiter.check('1.2.3.4');
    expect(decisao.allowed).toBe(false);
    // Mandar embora por 3600s quem já podia voltar em 20 é desperdício.
    expect(decisao.retryAfterSeconds).toBeLessThanOrEqual(20);
    expect(decisao.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('a virada da janela libera de novo', async () => {
    for (let i = 0; i < 4; i += 1) await limiter.check('1.2.3.4');
    clock.advance(UMA_HORA);

    expect((await limiter.check('1.2.3.4')).allowed).toBe(true);
  });

  it('clientes distintos não compartilham balde', async () => {
    for (let i = 0; i < 4; i += 1) await limiter.check('1.2.3.4');

    expect((await limiter.check('5.6.7.8')).allowed).toBe(true);
  });

  it('FALHA FECHADA quando o Redis cai', async () => {
    client.indisponivel = true;
    // Servir sem limite justamente quando não sabemos o consumo tornaria a
    // indisponibilidade um jeito de desligar a defesa.
    await esperarCodigo(limiter.check('1.2.3.4'), 'GUARD_UNAVAILABLE');
  });
});

describe('RedisBudgetGuard', () => {
  let clock: FixedClock;
  let client: FakeRedisClient;
  let guard: RedisBudgetGuard;

  beforeEach(() => {
    clock = new FixedClock(MEIO_DIA);
    client = new FakeRedisClient(clock);
    guard = new RedisBudgetGuard(client, clock, {
      dailyBudgetMicros: dolaresParaMicros(1),
      maxRequestMicros: dolaresParaMicros(0.1),
      pricing: PRICING,
      outputRatio: 0.7,
      keyPrefix: 'teste',
    });
  });

  it('autoriza uma análise típica', async () => {
    // 4.244 tokens de entrada ≈ a análise real medida.
    const decisao = await guard.authorize(4_244);
    expect(decisao.allowed).toBe(true);
    expect(decisao.reason).toBe('ok');
  });

  it('recusa análise cara demais SEM tocar o contador', async () => {
    // Acima de US$0,10: 30.000 entrada + 21.000 saída = 135.000 micros.
    const decisao = await guard.authorize(30_000);

    expect(decisao.allowed).toBe(false);
    expect(decisao.reason).toBe('request_too_expensive');
    // Uma análise que nunca seria autorizada não pode consumir orçamento.
    expect(client.espiar(guard.chaveDoDia())).toBeNull();
  });

  it('recusa quando o teto diário acaba, e diz quando voltar', async () => {
    // ~US$0,0155 por chamada; 1,00/0,0155 ≈ 64.
    for (let i = 0; i < 70; i += 1) await guard.authorize(4_244);

    const decisao = await guard.authorize(4_244);
    expect(decisao.allowed).toBe(false);
    expect(decisao.reason).toBe('daily_cap_reached');
    expect(decisao.retryAfterSeconds).toBe(12 * 60 * 60); // meio-dia até a virada
  });

  it('a recusa DEVOLVE o valor pré-cobrado', async () => {
    while ((await guard.authorize(4_244)).allowed) {
      // consome o teto
    }
    const depoisDaPrimeiraRecusa = client.espiar(guard.chaveDoDia());

    await guard.authorize(4_244);
    await guard.authorize(4_244);

    // Sem devolução, cada recusa continuaria consumindo e o teto se
    // esgotaria sozinho sob ataque — a defesa viraria o ataque.
    expect(client.espiar(guard.chaveDoDia())).toBe(depoisDaPrimeiraRecusa);
  });

  /**
   * O teste que justifica a pré-cobrança.
   *
   * Se o contador fosse incrementado só DEPOIS da chamada, N invocações
   * simultâneas leriam o mesmo saldo e se aprovariam todas — o teto seria
   * furado por paralelismo, que é exatamente o cenário de abuso.
   */
  it('autorizações CONCORRENTES não furam o teto', async () => {
    const decisoes = await Promise.all(
      Array.from({ length: 200 }, () => guard.authorize(4_244)),
    );

    const autorizadas = decisoes.filter((d) => d.allowed).length;

    expect(autorizadas).toBeGreaterThan(0);
    // Lê o CONTADOR REAL em vez de recompor o gasto com número mágico. A
    // versão anterior usava 15.552 micros por análise quando o custo real é
    // 19.099 — subestimava 18,6% e toleraria 64 autorizações onde o teto
    // correto é 52. O número certo sempre esteve aqui.
    expect(client.espiar(guard.chaveDoDia()) ?? 0).toBeLessThanOrEqual(
      dolaresParaMicros(1),
    );
  });

  it('o teto reinicia no dia seguinte', async () => {
    while ((await guard.authorize(4_244)).allowed) {
      // consome o teto de hoje
    }
    clock.advance(24 * 60 * 60 * 1_000);

    expect((await guard.authorize(4_244)).allowed).toBe(true);
  });

  it('FALHA FECHADA quando o Redis cai', async () => {
    client.indisponivel = true;
    await esperarCodigo(guard.authorize(4_244), 'GUARD_UNAVAILABLE');
  });

  it('cobra a SAÍDA, não só a entrada', async () => {
    // A saída custa 5x e é 73% do custo real. Um guard que contasse só a
    // entrada autorizaria muito além do teto.
    await guard.authorize(4_244);
    const cobrado = client.espiar(guard.chaveDoDia()) ?? 0;

    expect(cobrado).toBeGreaterThan(4_244); // > se fosse só entrada a 1/MTok
  });
});

describe('RedisBudgetGuard.settle — o ciclo de vida da reserva', () => {
  let clock: FixedClock;
  let client: FakeRedisClient;
  let guard: RedisBudgetGuard;

  beforeEach(() => {
    clock = new FixedClock(MEIO_DIA);
    client = new FakeRedisClient(clock);
    guard = new RedisBudgetGuard(client, clock, {
      dailyBudgetMicros: dolaresParaMicros(1),
      maxRequestMicros: dolaresParaMicros(0.1),
      pricing: PRICING,
      outputRatio: 0.7,
      keyPrefix: 'teste',
    });
  });

  it('falha SEM gasto devolve a reserva integral', async () => {
    const antes = client.espiar(guard.chaveDoDia()) ?? 0;
    await guard.authorize(4_244);
    expect(client.espiar(guard.chaveDoDia())).toBeGreaterThan(antes);

    await guard.settle(4_244, null);

    // É isto que fecha o vetor de negação de serviço: nada gasto, nada cobrado.
    expect(client.espiar(guard.chaveDoDia()) ?? 0).toBe(antes);
  });

  it('falha COM gasto parcial devolve só o que não foi gasto', async () => {
    await guard.authorize(4_244);

    // Dois de cinco lotes pagos antes de falhar.
    const parcial = {
      inputTokens: 1_700,
      outputTokens: 900,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
    };
    await guard.settle(4_244, parcial);

    // Devolver a estimativa INTEIRA zeraria o contador sobre dinheiro real —
    // o furo oposto ao do DoS.
    expect(client.espiar(guard.chaveDoDia())).toBe(1_700 + 900 * 5);
  });

  it('sucesso ajusta a reserva para o custo real', async () => {
    await guard.authorize(4_244);
    const reservado = client.espiar(guard.chaveDoDia()) ?? 0;

    await guard.settle(4_244, {
      inputTokens: 4_244,
      outputTokens: 2_261,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
    });

    const real = 4_244 + 2_261 * 5;
    expect(client.espiar(guard.chaveDoDia())).toBe(real);
    // A estimativa carrega margem; sem liquidar, ela viraria imposto.
    expect(real).toBeLessThan(reservado);
  });

  /**
   * A REPRODUÇÃO DO DEFEITO.
   *
   * Medido pela revisão antes da correção: 100 análises que falharam sem
   * gastar um token consumiram US$ 0,9931 de US$ 1,00, e a análise legítima
   * seguinte foi recusada. A defesa de custo tinha virado negação de serviço.
   */
  it('100 análises que FALHAM não esgotam o teto', async () => {
    for (let i = 0; i < 100; i += 1) {
      await guard.authorize(4_244);
      await guard.settle(4_244, null); // nada foi gasto
    }

    expect(client.espiar(guard.chaveDoDia()) ?? 0).toBe(0);
    expect((await guard.authorize(4_244)).allowed).toBe(true);
  });

  it('NUNCA lança, nem com o Redis fora', async () => {
    await guard.authorize(4_244);
    client.indisponivel = true;

    // Lançar aqui mascararia a causa original do erro do classificador.
    await expect(guard.settle(4_244, null)).resolves.toBeUndefined();
  });

  it('conta os tokens de cache, que também são cobrados', async () => {
    await guard.authorize(1_000);

    await guard.settle(1_000, {
      inputTokens: 1_000,
      outputTokens: 100,
      cacheCreationInputTokens: 500,
      cacheReadInputTokens: 200,
    });

    // Entrada total 1.700, não 1.000. Ignorar cache subestimaria o gasto.
    expect(client.espiar(guard.chaveDoDia())).toBe(1_700 + 100 * 5);
  });
});

describe('RedisCostRecorder — só observabilidade', () => {
  it('não toca no contador diário', async () => {
    const clock = new FixedClock(MEIO_DIA);
    const client = new FakeRedisClient(clock);
    const recorder = new RedisCostRecorder({ pricing: PRICING });
    const operacoesAntes = client.operacoes;

    await recorder.record(
      {
        inputTokens: 1_000,
        outputTokens: 100,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
      },
      'claude-haiku-4-5',
    );

    // O contador tem UM dono: quem cobra é quem liquida. Dois componentes
    // escrevendo na mesma chave foi o arranjo que escondeu os defeitos.
    expect(client.operacoes).toBe(operacoesAntes);
  });
});
