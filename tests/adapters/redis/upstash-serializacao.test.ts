import { describe, expect, it } from 'vitest';

import { UpstashRedisClient } from '../../../src/adapters/redis/upstash-client.js';

/**
 * Regressão de um defeito LATENTE, encontrado só quando o Redis passou a
 * guardar algo que não era contador.
 *
 * O `get` fazia `String(valor)`. Isso estava CERTO enquanto os únicos valores
 * eram números — `String(42)` dá `"42"`. Mas o cliente do Upstash
 * desserializa JSON por conta própria, então, no instante em que o cache de
 * análise começou a gravar um objeto, `String(objeto)` virou
 * `"[object Object]"`: 15 bytes no lugar de 35 mil.
 *
 * O sintoma era o pior possível — NENHUM erro. O cache simplesmente nunca
 * acertava, a análise rodava de novo toda vez, e a única pista teria sido a
 * conta continuar subindo. Foi preciso medir contra o Upstash real para
 * enxergar.
 */

/** Substitui o `Redis` interno, imitando a desserialização automática. */
function comRedisFalso(devolve: unknown): UpstashRedisClient {
  const client = new UpstashRedisClient('https://exemplo.test', 'token');
  (client as unknown as { redis: { get: (k: string) => Promise<unknown> } }).redis = {
    get: async () => devolve,
  };
  return client;
}

describe('UpstashRedisClient.get — o Upstash desserializa sozinho', () => {
  it('OBJETO volta como JSON, não como "[object Object]"', async () => {
    const client = comRedisFalso({ url: 'https://x.test', itens: [1, 2] });

    const lido = await client.get('k');

    expect(lido).not.toBe('[object Object]');
    expect(lido).toBe('{"url":"https://x.test","itens":[1,2]}');
    expect(JSON.parse(lido ?? '')).toEqual({ url: 'https://x.test', itens: [1, 2] });
  });

  it('o valor sobrevive à ida e volta, mesmo grande', async () => {
    const original = { texto: 'x'.repeat(5_000), n: 42 };
    const client = comRedisFalso(original);

    const lido = await client.get('k');

    expect(JSON.parse(lido ?? '')).toEqual(original);
  });

  it('NÚMERO continua virando string, como antes', async () => {
    // O comportamento que já existia não pode regredir: as guardas de custo
    // leem contadores por aqui.
    expect(await comRedisFalso(42).get('k')).toBe('42');
  });

  it('STRING volta intacta, sem aspas extras', async () => {
    // Reserializar uma string com JSON.stringify acrescentaria aspas e
    // quebraria a leitura de contador gravado como texto.
    expect(await comRedisFalso('valor').get('k')).toBe('valor');
  });

  it('ausência continua sendo null', async () => {
    expect(await comRedisFalso(null).get('k')).toBeNull();
    expect(await comRedisFalso(undefined).get('k')).toBeNull();
  });
});
