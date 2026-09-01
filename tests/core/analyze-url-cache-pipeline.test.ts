import { describe, expect, it } from 'vitest';

import type { Analysis } from '../../src/core/domain/analysis.js';
import { DISCLAIMER_PT_BR } from '../../src/core/domain/methodology.js';
import { createAnalyzeUrl } from '../../src/core/usecases/analyze-url.js';
import type { AnalysisCache } from '../../src/core/ports/analysis-cache.js';
import { makeHarness, StubRateLimiter } from '../helpers/stub-ports.js';

/**
 * O cache dentro do pipeline. O que importa aqui não é guardar — é ONDE ele
 * entra, porque a posição tem três consequências que só um teste de ordem
 * pega.
 */

const INPUT = {
  url: 'https://exemplo.com/artigo',
  clientKey: '203.0.113.9',
  includeSuggestions: false,
};

/** Cache observável: registra cada operação, na ordem. */
function cacheEspiao(guardado: Analysis | null = null): {
  cache: AnalysisCache;
  ops: string[];
  gravado: { valor: Analysis | null };
} {
  const ops: string[] = [];
  const gravado: { valor: Analysis | null } = { valor: null };
  const cache: AnalysisCache = {
    async get(key) {
      ops.push(`get:${key}`);
      return guardado;
    },
    async set(key, analysis) {
      ops.push(`set:${key}`);
      gravado.valor = analysis;
    },
  };
  return { cache, ops, gravado };
}

describe('Cache no pipeline — acerto', () => {
  it('acerto de cache PULA fetch, extração, segmentação e classificação', async () => {
    // O ganho não é só dinheiro: são também os ~10 segundos da análise.
    const { deps, calls } = makeHarness();
    const guardada = { ...(await createAnalyzeUrl(deps)(INPUT)) };

    const { deps: deps2, calls: calls2 } = makeHarness();
    const { cache } = cacheEspiao(guardada);

    const resultado = await createAnalyzeUrl({ ...deps2, analysisCache: cache })(
      INPUT,
    );

    expect(resultado.url).toBe(guardada.url);
    expect(calls2).not.toContain('fetch');
    expect(calls2).not.toContain('classify');
    expect(calls).toContain('fetch');
  });

  /*
   * ADR-004: A RESSALVA NAO PODE ENVELHECER DENTRO DO CACHE.
   *
   * A ADR-004 lista tres modos pelos quais a ressalva morre — redesign, print
   * cortado, landing page nova. Este e' um quarto, e foi encontrado rodando o
   * produto em modo producao: a analise inteira e' guardada, bloco de
   * metodologia junto. Corrigir `METHODOLOGY_URL` no codigo nao alcanca quem
   * recebe resposta do cache.
   *
   * Nao e' hipotetico. `METHODOLOGY_URL` ja apontou para `/metodologia` quando
   * a rota nao existia (404), depois para `/#metodo` (uma secao que cobria um
   * dos tres itens que a ADR-004 exige), e hoje para a pagina de verdade. As
   * tres entradas da vitrine — o primeiro clique de qualquer visitante —
   * estavam servindo `/#metodo`, com prazo de trinta dias.
   *
   * A distincao que resolve: o cache existe para nao remedir. Metodologia nao
   * e' medicao, e' afirmacao sobre o build que responde AGORA. Guarda-se o
   * numero; declara-se o contrato.
   */
  it('acerto de cache serve a metodologia ATUAL, nao a guardada', async () => {
    const { deps } = makeHarness();
    const antiga: Analysis = {
      ...(await createAnalyzeUrl(deps)(INPUT)),
      // Valor que o harness nao produz sozinho: sem isso, a assercao de que a
      // medicao sobrevive comparava o resultado com ele mesmo e passava
      // mesmo com a medicao sendo zerada na volta do cache.
      outcome: { kind: 'scored', score: 77 },
      methodology: {
        kind: 'heuristic_proxy',
        measuredCitations: false,
        disclaimer: 'ressalva de uma versao anterior',
        methodologyUrl: '/#metodo',
      },
    };

    // Destino DIFERENTE do default do harness: um valor cravado no codigo
    // passaria pela versao anterior deste teste sem seguir a configuracao.
    const { deps: deps2 } = makeHarness();
    const { cache } = cacheEspiao(antiga);
    const resultado = await createAnalyzeUrl({
      ...deps2,
      analysisCache: cache,
      config: { ...deps2.config, methodologyUrl: '/metodologia-v2' },
    })(INPUT);

    expect(resultado.methodology.methodologyUrl).toBe('/metodologia-v2');
    expect(resultado.methodology.disclaimer).toBe(DISCLAIMER_PT_BR);
    // A medicao guardada continua intacta: so' o contrato foi renovado.
    expect(resultado.outcome).toEqual({ kind: 'scored', score: 77 });
    expect(resultado.breakdown).toEqual(antiga.breakdown);
  });

  it('o acerto acontece DEPOIS do rate limit', async () => {
    /*
     * Se o cache viesse antes, ele viraria burla de limite: bastaria repetir
     * uma URL já analisada para nunca contar contra a cota, e um cliente
     * abusivo teria acesso ilimitado ao que já estivesse guardado.
     */
    const { deps, calls } = makeHarness();
    const { cache, ops } = cacheEspiao(null);
    const rateLimiter = new StubRateLimiter(calls, {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 42,
    });

    await expect(
      createAnalyzeUrl({ ...deps, rateLimiter, analysisCache: cache })(INPUT),
    ).rejects.toMatchObject({ code: 'RATE_LIMITED' });

    // Bloqueado pelo rate limit: o cache nem foi consultado.
    expect(ops).toEqual([]);
  });
});

describe('Cache no pipeline — gravação', () => {
  it('grava a análise depois de produzi-la', async () => {
    const { deps } = makeHarness();
    const { cache, ops, gravado } = cacheEspiao(null);

    const resultado = await createAnalyzeUrl({ ...deps, analysisCache: cache })(
      INPUT,
    );

    expect(ops.some((o) => o.startsWith('set:'))).toBe(true);
    expect(gravado.valor?.url).toBe(resultado.url);
  });

  it('a chave de leitura e a de gravação são a MESMA', async () => {
    // Chaves divergentes produziriam um cache que grava e nunca acerta — e o
    // sintoma seria "o cache não funciona", sem erro nenhum.
    const { deps } = makeHarness();
    const { cache, ops } = cacheEspiao(null);

    await createAnalyzeUrl({ ...deps, analysisCache: cache })(INPUT);

    const lida = ops.find((o) => o.startsWith('get:'))?.slice(4);
    const gravada = ops.find((o) => o.startsWith('set:'))?.slice(4);
    expect(lida).toBe(gravada);
  });

  it('a chave carrega a versão do score e o modelo', async () => {
    const { deps } = makeHarness();
    const { cache, ops } = cacheEspiao(null);

    await createAnalyzeUrl({ ...deps, analysisCache: cache })(INPUT);

    const chave = ops[0] ?? '';
    expect(chave).toContain(deps.config.model);
    expect(chave).toMatch(/:v\d/u);
  });
});

describe('Cache no pipeline — refresh', () => {
  it('`refresh: true` IGNORA o que está guardado e analisa de novo', async () => {
    /*
     * É o que impede o cache de quebrar o caso de uso principal. Quem editou o
     * próprio artigo e voltou para conferir PRECISA de medição nova — receber
     * o resultado de antes faria a reescrita dele parecer inútil.
     */
    const { deps: base } = makeHarness();
    const antiga = await createAnalyzeUrl(base)(INPUT);

    const { deps, calls } = makeHarness();
    const { cache, ops } = cacheEspiao(antiga);

    await createAnalyzeUrl({ ...deps, analysisCache: cache })({
      ...INPUT,
      refresh: true,
    });

    expect(ops.some((o) => o.startsWith('get:'))).toBe(false);
    expect(calls).toContain('classify');
  });

  it('`refresh` GRAVA o resultado novo por cima', async () => {
    // Senão a próxima pessoa receberia o resultado velho de novo, e o refresh
    // beneficiaria só quem o pediu.
    const { deps: base } = makeHarness();
    const antiga = await createAnalyzeUrl(base)(INPUT);

    const { deps } = makeHarness();
    const { cache, ops } = cacheEspiao(antiga);

    await createAnalyzeUrl({ ...deps, analysisCache: cache })({
      ...INPUT,
      refresh: true,
    });

    expect(ops.some((o) => o.startsWith('set:'))).toBe(true);
  });

  it('sem `refresh`, o default é USAR o cache', async () => {
    // Ausência do campo tem que significar "pode usar". Se omitir furasse o
    // cache, todo cliente antigo passaria a gastar sem saber.
    const { deps: base } = makeHarness();
    const antiga = await createAnalyzeUrl(base)(INPUT);

    const { deps, calls } = makeHarness();
    const { cache } = cacheEspiao(antiga);

    await createAnalyzeUrl({ ...deps, analysisCache: cache })(INPUT);

    expect(calls).not.toContain('classify');
  });
});

describe('Cache no pipeline — ausência', () => {
  it('sem cache montado, o pipeline roda exatamente como antes', async () => {
    // O contrato marca a porta como opcional justamente para isto: cache é
    // conveniência, e exigi-lo transformaria conveniência em ponto de falha.
    const { deps, calls } = makeHarness();

    const resultado = await createAnalyzeUrl(deps)(INPUT);

    expect(resultado.outcome.kind).toBe('scored');
    expect(calls).toContain('classify');
  });
});
