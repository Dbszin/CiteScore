/**
 * Guarda de producao para adapters de desenvolvimento.
 *
 * `AllowAllRateLimiter` e `UnlimitedBudgetGuard` desligam as defesas que
 * `specs/.../protecao-custo/spec.md` marca como BLOQUEADORAS de deploy
 * publico. Ate agora a protecao era apenas um comentario dizendo "nunca em
 * producao" — e comentario nao impede montagem.
 *
 * Com a estimativa de ~US$0,13 por analise (ADR-005), mil requisicoes
 * abusivas custam ~US$130. Falhar na inicializacao e barato; descobrir pela
 * fatura, nao.
 */
export function assertNotProduction(adapterName: string): void {
  if (process.env['NODE_ENV'] === 'production') {
    throw new Error(
      `${adapterName} e um adapter de desenvolvimento e nunca deve ser ` +
        'montado em producao: ele desliga uma defesa de custo/abuso ' +
        'exigida por specs/.../protecao-custo/spec.md. Use o adapter ' +
        'Redis correspondente (M4).',
    );
  }
}
