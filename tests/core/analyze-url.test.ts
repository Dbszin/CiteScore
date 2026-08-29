import { describe, expect, it } from 'vitest';
import { analysisError, isAnalysisError } from '../../src/core/domain/errors.js';
import { createAnalyzeUrl } from '../../src/core/usecases/analyze-url.js';
import {
  classifyAll,
  makeHarness,
  makeSentences,
  StubBudgetGuard,
  StubClassifierWithoutCount,
  StubRateLimiter,
  StubSuggestionWriter,
} from '../helpers/stub-ports.js';

const INPUT = {
  url: 'https://exemplo.com/artigo',
  clientKey: '203.0.113.9',
  includeSuggestions: false,
};

async function expectAnalysisError(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  await expect(promise).rejects.toSatisfy(
    (error: unknown) => isAnalysisError(error) && error.code === code,
  );
}

describe('createAnalyzeUrl', () => {
  it('percorre o pipeline inteiro e devolve uma análise pontuada', async () => {
    const { deps } = makeHarness();

    const analysis = await createAnalyzeUrl(deps)(INPUT);

    expect(analysis.outcome.kind).toBe('scored');
    expect(analysis.breakdown.analyzableSentences).toBe(20);
    expect(analysis.url).toBe('https://exemplo.com/artigo');
    expect(analysis.truncated).toBe(false);
    expect(analysis.suggestionsDegraded).toBe(false);
  });

  /**
   * O teste que a spec exige (api/spec.md § Acceptance Criteria).
   *
   * Reordenar o pipeline — autorizar o budget depois de classificar — anula a
   * proteção de custo sem produzir nenhum erro visível. Nenhum outro teste
   * pegaria isso: o resultado continuaria correto.
   */
  it('roda TODAS as guardas antes de gastar um único token', async () => {
    const { deps, calls } = makeHarness();

    await createAnalyzeUrl(deps)(INPUT);

    expect(calls.indexOf('rateLimit')).toBeLessThan(calls.indexOf('fetch'));
    expect(calls.indexOf('budget')).toBeLessThan(calls.indexOf('classify'));
    expect(calls.indexOf('estimateInputTokens')).toBeLessThan(
      calls.indexOf('budget'),
    );

    expect(calls).toEqual([
      'rateLimit',
      'fetch',
      'extract',
      'segment',
      'estimateInputTokens',
      'budget',
      'classify',
      'settle',
      'cost',
    ]);
  });

  it('nem busca a página quando o rate limit recusa', async () => {
    const calls: string[] = [];
    const { deps } = makeHarness({
      rateLimiter: new StubRateLimiter(calls, {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: 1_800,
      }),
    });

    await expectAnalysisError(createAnalyzeUrl(deps)(INPUT), 'RATE_LIMITED');
    expect(calls).not.toContain('fetch');
  });

  it('propaga o Retry-After da guarda para o erro', async () => {
    const calls: string[] = [];
    const { deps } = makeHarness({
      budgetGuard: new StubBudgetGuard(calls, false, 3_600),
    });

    await expect(createAnalyzeUrl(deps)(INPUT)).rejects.toSatisfy(
      (error: unknown) =>
        isAnalysisError(error) && error.retryAfterSeconds === 3_600,
    );
  });

  it('não classifica nada quando o budget guard recusa', async () => {
    const { deps, calls } = makeHarness({}, {});
    const budgetGuard = new StubBudgetGuard(calls, false);

    await expectAnalysisError(
      createAnalyzeUrl({ ...deps, budgetGuard })(INPUT),
      'BUDGET_EXCEEDED',
    );
    expect(calls).not.toContain('classify');
    expect(calls).not.toContain('cost');
  });

  it('recusa por tamanho vira REQUEST_TOO_EXPENSIVE, não BUDGET_EXCEEDED', async () => {
    // As duas recusas do budget guard são opostas para quem está na tela:
    // "este artigo é caro demais" tem saída, "acabou a cota" não tem.
    const caroDemais = {
      async authorize() {
        return {
          allowed: false,
          reason: 'request_too_expensive' as const,
          estimatedInputTokens: 999_999,
          retryAfterSeconds: null,
        };
      },
      async settle(): Promise<void> {
        // Recusa não cria reserva, então não há o que liquidar.
      },
    };
    const { deps } = makeHarness({ budgetGuard: caroDemais });

    await expectAnalysisError(
      createAnalyzeUrl(deps)(INPUT),
      'REQUEST_TOO_EXPENSIVE',
    );
  });

  it('alimenta o budget guard com a estimativa do classificador', async () => {
    const { deps, budgetGuard } = makeHarness();

    await createAnalyzeUrl(deps)(INPUT);

    expect(budgetGuard.authorizedWith).toBe(1_000);
  });

  it('estima por aproximação quando o classificador não sabe contar', async () => {
    const calls: string[] = [];
    const sentences = makeSentences(20);
    const { deps, budgetGuard } = makeHarness(
      {
        classifier: new StubClassifierWithoutCount(calls, {
          classifications: classifyAll(sentences),
          usage: null,
        }),
      },
      { sentences },
    );

    await createAnalyzeUrl(deps)(INPUT);

    // Aproximação grosseira, mas nunca zero — zero autorizaria qualquer gasto.
    expect(budgetGuard.authorizedWith).toBeGreaterThan(0);
  });

  it('degrada para a aproximação quando a contagem de tokens FALHA', async () => {
    // Antes, uma falha nesta chamada — gratuita, e hoje descartada pelo
    // UnlimitedBudgetGuard — derrubava a análise inteira.
    const calls: string[] = [];
    const sentences = makeSentences(20);
    const failingCounter = {
      async classify() {
        calls.push('classify');
        return { classifications: classifyAll(sentences), usage: null };
      },
      async estimateInputTokens(): Promise<number> {
        throw new Error('countTokens indisponível');
      },
    };
    const { deps, budgetGuard } = makeHarness(
      { classifier: failingCounter },
      { sentences },
    );

    const analysis = await createAnalyzeUrl(deps)(INPUT);

    expect(analysis.outcome.kind).toBe('scored');
    // Degrada para a aproximação, NUNCA para zero — zero autorizaria
    // qualquer gasto e anularia o teto.
    expect(budgetGuard.authorizedWith).toBeGreaterThan(0);
  });

  it('a falha da contagem não impede o budget guard de recusar', async () => {
    const calls: string[] = [];
    const sentences = makeSentences(20);
    const failingCounter = {
      async classify() {
        calls.push('classify');
        return { classifications: classifyAll(sentences), usage: null };
      },
      async estimateInputTokens(): Promise<number> {
        throw new Error('countTokens indisponível');
      },
    };
    const { deps } = makeHarness(
      {
        classifier: failingCounter,
        budgetGuard: new StubBudgetGuard(calls, false),
      },
      { sentences },
    );

    await expectAnalysisError(createAnalyzeUrl(deps)(INPUT), 'BUDGET_EXCEEDED');
    expect(calls).not.toContain('classify');
  });

  /**
   * A INVARIANTE DA ADR-009: autorizou, liquidou.
   *
   * Antes disso, uma falha do classificador deixava a pré-cobrança presa por
   * 48h. Medido pela revisão: 100 análises que falharam sem gastar um token
   * consumiram US$ 0,9931 de US$ 1,00, e a análise legítima seguinte foi
   * recusada. A defesa de custo tinha virado negação de serviço.
   */
  it('liquida a reserva mesmo quando a classificação FALHA', async () => {
    const calls: string[] = [];
    const sentences = makeSentences(20);
    const budgetGuard = new StubBudgetGuard(calls);
    const quebrado = {
      async classify(): Promise<never> {
        calls.push('classify');
        throw analysisError('CLASSIFIER_FAILED');
      },
      async estimateInputTokens(): Promise<number> {
        return 4_244;
      },
    };
    const { deps } = makeHarness(
      { budgetGuard, classifier: quebrado },
      { sentences },
    );

    await expectAnalysisError(createAnalyzeUrl(deps)(INPUT), 'CLASSIFIER_FAILED');

    expect(budgetGuard.settlements).toHaveLength(1);
    // `null` significa "nada foi gasto": a reserva volta integral.
    expect(budgetGuard.settlements[0]?.actualUsage).toBeNull();
    expect(budgetGuard.settlements[0]?.estimatedInputTokens).toBe(4_244);
  });

  it('devolve só o não gasto quando a falha foi PARCIAL', async () => {
    const calls: string[] = [];
    const sentences = makeSentences(20);
    const budgetGuard = new StubBudgetGuard(calls);
    const parcial = {
      inputTokens: 1_700,
      outputTokens: 900,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
    };
    const meioCaminho = {
      async classify(): Promise<never> {
        // Dois de cinco lotes já foram pagos antes de falhar.
        throw analysisError('CLASSIFIER_REFUSED', undefined, null, parcial);
      },
      async estimateInputTokens(): Promise<number> {
        return 4_244;
      },
    };
    const { deps } = makeHarness(
      { budgetGuard, classifier: meioCaminho },
      { sentences },
    );

    await expectAnalysisError(
      createAnalyzeUrl(deps)(INPUT),
      'CLASSIFIER_REFUSED',
    );

    // Devolver a estimativa INTEIRA zeraria o contador sobre dinheiro real.
    expect(budgetGuard.settlements[0]?.actualUsage).toEqual(parcial);
  });

  it('a liquidação NÃO mascara o erro original', async () => {
    const calls: string[] = [];
    const sentences = makeSentences(20);
    const guardaQueFalhaAoLiquidar = {
      async authorize(estimatedInputTokens: number) {
        calls.push('budget');
        return {
          allowed: true,
          reason: 'ok' as const,
          estimatedInputTokens,
          retryAfterSeconds: null,
        };
      },
      async settle(): Promise<void> {
        // Contrato: settle NUNCA lança. Se lançasse, o erro de contabilidade
        // substituiria a causa que o usuário e o log precisam ver.
      },
    };
    const quebrado = {
      async classify(): Promise<never> {
        throw analysisError('CLASSIFIER_REFUSED');
      },
      async estimateInputTokens(): Promise<number> {
        return 100;
      },
    };
    const { deps } = makeHarness(
      { budgetGuard: guardaQueFalhaAoLiquidar, classifier: quebrado },
      { sentences },
    );

    await expectAnalysisError(
      createAnalyzeUrl(deps)(INPUT),
      'CLASSIFIER_REFUSED',
    );
  });

  it('liquida com o uso REAL no caminho de sucesso', async () => {
    const { deps, budgetGuard } = makeHarness();

    await createAnalyzeUrl(deps)(INPUT);

    expect(budgetGuard.settlements).toHaveLength(1);
    expect(budgetGuard.settlements[0]?.actualUsage).not.toBeNull();
  });

  it('recusa página-índice antes de gastar', async () => {
    // 30 sentenças, só 6 analisáveis: razão 0,2 < limiar 0,35.
    const sentences = [
      ...makeSentences(6),
      ...makeSentences(24).map((sentence, index) => ({
        ...sentence,
        id: 100 + index,
        analyzable: false,
        excludedReason: 'heading' as const,
      })),
    ];
    const { deps, calls } = makeHarness({}, { sentences });

    await expectAnalysisError(createAnalyzeUrl(deps)(INPUT), 'INDEX_PAGE');
    expect(calls).not.toContain('classify');
  });

  it('trunca no cap e sinaliza em vez de analisar em silêncio', async () => {
    const sentences = makeSentences(30);
    const { deps, classifier } = makeHarness(
      {
        config: {
          methodologyUrl: '/metodologia',
          model: 'claude-haiku-4-5',
          maxAnalyzableSentences: 12,
        },
      },
      { sentences, classifications: classifyAll(makeSentences(12)) },
    );

    const analysis = await createAnalyzeUrl(deps)(INPUT);

    expect(analysis.truncated).toBe(true);
    expect(classifier.received).toHaveLength(12);
    expect(analysis.breakdown.analyzableSentences).toBe(12);
  });

  it('degrada quando as sugestões falham, sem derrubar o relatório', async () => {
    const calls: string[] = [];
    const sentences = makeSentences(20);
    const { deps } = makeHarness(
      {
        suggestionWriter: new StubSuggestionWriter(
          calls,
          new Error('provedor fora do ar'),
        ),
      },
      { sentences, classifications: classifyAll(sentences, 'UNSOURCED') },
    );

    const analysis = await createAnalyzeUrl(deps)({
      ...INPUT,
      includeSuggestions: true,
    });

    expect(analysis.suggestionsDegraded).toBe(true);
    expect(analysis.outcome.kind).toBe('scored');
    expect(analysis.suggestions).toEqual([]);
  });

  it('não pede sugestões quando não há sentença sem fonte', async () => {
    const calls: string[] = [];
    const sentences = makeSentences(20);
    const writer = new StubSuggestionWriter(calls);
    const { deps } = makeHarness(
      { suggestionWriter: writer },
      { sentences, classifications: classifyAll(sentences, 'SOURCED') },
    );

    await createAnalyzeUrl(deps)({ ...INPUT, includeSuggestions: true });

    expect(calls).not.toContain('suggest');
  });

  it('registra o custo com o modelo configurado', async () => {
    const { deps, costRecorder } = makeHarness();

    await createAnalyzeUrl(deps)(INPUT);

    expect(costRecorder.entries).toHaveLength(1);
    expect(costRecorder.entries[0]?.model).toBe('claude-haiku-4-5');
  });

  it('não registra custo quando nada foi gasto', async () => {
    const calls: string[] = [];
    const sentences = makeSentences(20);
    const { deps } = makeHarness(
      {
        classifier: new StubClassifierWithoutCount(calls, {
          classifications: classifyAll(sentences),
          usage: null,
        }),
      },
      { sentences },
    );

    await createAnalyzeUrl(deps)(INPUT);

    expect(calls).not.toContain('cost');
  });

  it('deixa o erro do fetcher subir sem traduzir', async () => {
    const { deps } = makeHarness();
    const failing = {
      async fetch() {
        throw analysisError('ACCESS_FORBIDDEN');
      },
    };

    await expectAnalysisError(
      createAnalyzeUrl({ ...deps, fetcher: failing })(INPUT),
      'ACCESS_FORBIDDEN',
    );
  });
});
