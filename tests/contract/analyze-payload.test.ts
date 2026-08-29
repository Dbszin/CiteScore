import { describe, expect, it } from 'vitest';
import { HTTP_STATUS } from '../../src/app/api/analyze/error-status.js';
import type { AnalysisErrorCode } from '../../src/core/domain/errors.js';
import { USER_MESSAGES } from '../../src/core/domain/errors.js';
import { createAnalyzeUrl } from '../../src/core/usecases/analyze-url.js';
import { makeHarness } from '../helpers/stub-ports.js';

const INPUT = {
  url: 'https://exemplo.com/artigo',
  clientKey: '203.0.113.9',
  includeSuggestions: false,
};

/**
 * O payload é o contrato (ADR-004). A ressalva de honestidade não vive na UI:
 * vive aqui, e este teste falha antes que alguém consiga publicar uma resposta
 * que apresente o score sem o que o qualifica.
 */
describe('Contrato do payload de /api/analyze', () => {
  it('toda análise bem-sucedida traz methodology, scoreVersion e breakdown', async () => {
    const { deps } = makeHarness();

    const analysis = await createAnalyzeUrl(deps)(INPUT);

    expect(analysis.methodology).toBeDefined();
    expect(analysis.scoreVersion).toBeDefined();
    expect(analysis.breakdown).toBeDefined();
  });

  it('a methodology do payload nega medição de citação', async () => {
    const { deps } = makeHarness();

    const analysis = await createAnalyzeUrl(deps)(INPUT);

    expect(analysis.methodology.kind).toBe('heuristic_proxy');
    expect(analysis.methodology.measuredCitations).toBe(false);
    expect(analysis.methodology.disclaimer.length).toBeGreaterThan(80);
    expect(analysis.methodology.methodologyUrl).toBe('/metodologia');
  });

  it('o breakdown acompanha o score — nunca um sem o outro', async () => {
    const { deps } = makeHarness();

    const analysis = await createAnalyzeUrl(deps)(INPUT);

    // Se há score, há as três contagens que o explicam. Publicar o número
    // sozinho é exatamente o que a ADR-004 proíbe.
    expect(analysis.outcome.kind).toBe('scored');
    for (const key of ['sourced', 'unsourced', 'opinion', 'analyzableSentences'] as const) {
      expect(analysis.breakdown[key], key).toBeTypeOf('number');
    }
  });

  it('o payload é serializável em JSON sem perder campo obrigatório', async () => {
    const { deps } = makeHarness();

    const analysis = await createAnalyzeUrl(deps)(INPUT);
    const roundTrip: unknown = JSON.parse(JSON.stringify({ ok: true, analysis }));

    const body = roundTrip as { ok: boolean; analysis: Record<string, unknown> };
    expect(body.ok).toBe(true);
    for (const key of ['methodology', 'scoreVersion', 'breakdown', 'outcome'] as const) {
      expect(body.analysis[key], key).toBeDefined();
    }
  });
});

describe('Mapa de status HTTP', () => {
  const codes = Object.keys(HTTP_STATUS) as AnalysisErrorCode[];

  it('cobre todo código de erro que tem mensagem de usuário', () => {
    // `USER_MESSAGES` também é `Record<AnalysisErrorCode, string>`, então as
    // duas chaves derivam da mesma união. Divergir aqui significa que uma das
    // duas parou de ser exaustiva.
    expect(codes.sort()).toEqual(Object.keys(USER_MESSAGES).sort());
  });

  it('nenhum erro previsto vira 500', () => {
    // 500 é reservado para o que NÃO previmos. Um código conhecido caindo
    // em 500 esconde tratamento que existe.
    for (const code of codes) {
      expect(HTTP_STATUS[code], code).not.toBe(500);
    }
  });

  it('todo status é um código HTTP plausível', () => {
    for (const code of codes) {
      expect(HTTP_STATUS[code], code).toBeGreaterThanOrEqual(400);
      expect(HTTP_STATUS[code], code).toBeLessThan(600);
    }
  });

  it('429 fica só onde o limite É do cliente', () => {
    // O rate limit é por IP: dizer "você fez requisições demais" é verdade.
    expect(HTTP_STATUS.RATE_LIMITED).toBe(429);
  });

  it('o teto diário responde 503, não 429', () => {
    // O teto é GLOBAL, consumido por todos os visitantes somados. Responder
    // 429 a quem fez uma única requisição afirma algo falso sobre o
    // comportamento dele; 503 descreve o que de fato ocorre.
    expect(HTTP_STATUS.BUDGET_EXCEEDED).toBe(503);
    expect(HTTP_STATUS.GUARD_UNAVAILABLE).toBe(503);
  });

  it('a recusa ACIONÁVEL tem status próprio', () => {
    // "Este artigo é grande demais" tem saída — trocar de artigo. Colapsar
    // isso no mesmo código do teto diário transformaria um problema
    // resolvível num beco aparente.
    expect(HTTP_STATUS.REQUEST_TOO_EXPENSIVE).toBe(413);
    expect(HTTP_STATUS.REQUEST_TOO_EXPENSIVE).not.toBe(
      HTTP_STATUS.BUDGET_EXCEEDED,
    );
  });

  it('erro de entrada é 4xx e falha de provedor é 5xx', () => {
    expect(HTTP_STATUS.INVALID_URL).toBeLessThan(500);
    expect(HTTP_STATUS.BLOCKED_HOST).toBeLessThan(500);
    expect(HTTP_STATUS.CLASSIFIER_FAILED).toBeGreaterThanOrEqual(500);
    expect(HTTP_STATUS.FETCH_TIMEOUT).toBeGreaterThanOrEqual(500);
  });
});
