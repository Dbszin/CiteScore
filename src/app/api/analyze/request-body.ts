/**
 * Leitura dos campos opcionais do corpo da requisição.
 *
 * Vive fora de `route.ts` pela mesma razão que `HTTP_STATUS`: arquivos de rota
 * do Next só aceitam um conjunto fixo de exports, e isto precisa ser
 * importável pelo teste.
 *
 * O que se prova aqui são os DEFAULTS. Eles decidem o comportamento de todo
 * cliente que omite o campo — incluindo clientes antigos, que nunca vão ser
 * atualizados — e errar um default é o tipo de mudança que não produz erro
 * nenhum, só uma conta maior no fim do mês.
 */

function objeto(body: unknown): Record<string, unknown> | null {
  return typeof body === 'object' && body !== null
    ? (body as Record<string, unknown>)
    : null;
}

/**
 * Default `true`, conforme o contrato em `api/spec.md`.
 *
 * Omitir pede sugestões: é o comportamento mais completo, e o campo existe
 * para quem quer DESLIGAR.
 */
export function readIncludeSuggestions(body: unknown): boolean {
  const value = objeto(body)?.['includeSuggestions'];
  return typeof value === 'boolean' ? value : true;
}

/**
 * Default `false`. O oposto do de cima, e de propósito.
 *
 * Ausência de `refresh` tem que significar "pode usar o cache". Se omitir
 * ligasse o refresh, todo cliente que não conhece o campo passaria a furar o
 * cache — e o cache existe justamente porque cada análise custa. O sintoma
 * seria uma conta alta sem nenhum erro aparecendo em lugar nenhum.
 *
 * Comparação estrita com `true`: string `"true"`, `1` e `"1"` NÃO ligam o
 * refresh. Aceitar coerção deixaria um cliente mal escrito furar o cache sem
 * intenção.
 */
export function readRefresh(body: unknown): boolean {
  return objeto(body)?.['refresh'] === true;
}
