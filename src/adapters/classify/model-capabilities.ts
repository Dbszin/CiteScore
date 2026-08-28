/**
 * Capacidades de API por modelo.
 *
 * `ANTHROPIC_MODEL` é variável de ambiente e o usuário troca de tier sem
 * tocar em código — a ADR-005 fez disso um ponto único de propósito. O
 * problema é que os modelos NÃO compartilham a mesma superfície de API:
 * passar um parâmetro que o modelo não suporta retorna 400.
 *
 * Este mapa existe para que a troca continue sendo só uma variável de
 * ambiente, e não uma armadilha.
 *
 * Fonte: documentação da Claude API consultada em 2026-08-28.
 */

export interface ModelCapabilities {
  /**
   * `output_config.effort`. **Erra em Haiku 4.5 e Sonnet 4.5.** A ADR-005
   * especificou `effort: "low"` assumindo `claude-opus-5`; com o haiku
   * escolhido em OQ-1, enviar isso derrubaria a primeira chamada real.
   */
  readonly supportsEffort: boolean;

  /**
   * `thinking: { type: "adaptive" }`. A família 4.5 e anteriores usam
   * `{ type: "enabled", budget_tokens: N }`; omitir significa sem thinking.
   * Para classificação em lote, sem thinking é o desejável — mais barato e
   * mais rápido, e a tarefa não exige raciocínio longo.
   */
  readonly supportsAdaptiveThinking: boolean;

  /**
   * Fallback server-side em caso de recusa do classificador de segurança.
   * Desenhado para Fable 5 / Opus 5.
   */
  readonly supportsServerFallback: boolean;

  /**
   * Prefixo mínimo, em tokens, para que `cache_control` tenha efeito.
   *
   * Abaixo desse tamanho o cache **falha em silêncio**: sem erro, apenas
   * `cache_creation_input_tokens: 0`. E o mínimo NÃO é monotônico entre
   * gerações — 512 no Opus 5, mas 4096 no Haiku 4.5.
   */
  readonly minCacheablePrefixTokens: number;
}

/**
 * Default deliberadamente CONSERVADOR para modelo desconhecido: nenhum
 * parâmetro opcional é enviado. Um parâmetro a mais causa 400; um a menos
 * apenas deixa de otimizar. Falhar para o lado que ainda funciona.
 */
const CONSERVATIVE: ModelCapabilities = {
  supportsEffort: false,
  supportsAdaptiveThinking: false,
  supportsServerFallback: false,
  minCacheablePrefixTokens: 4096,
};

const CAPABILITIES: readonly (readonly [RegExp, ModelCapabilities])[] = [
  [
    /^claude-(?:opus-5|fable-5|mythos-5)/u,
    {
      supportsEffort: true,
      supportsAdaptiveThinking: true,
      supportsServerFallback: true,
      minCacheablePrefixTokens: 512,
    },
  ],
  [
    /^claude-(?:opus-4-8|sonnet-5)/u,
    {
      supportsEffort: true,
      supportsAdaptiveThinking: true,
      supportsServerFallback: false,
      minCacheablePrefixTokens: 1024,
    },
  ],
  [
    /^claude-sonnet-4-6/u,
    {
      supportsEffort: true,
      supportsAdaptiveThinking: true,
      supportsServerFallback: false,
      minCacheablePrefixTokens: 1024,
    },
  ],
  [
    /^claude-(?:opus-4-7|opus-4-6)/u,
    {
      supportsEffort: true,
      supportsAdaptiveThinking: true,
      supportsServerFallback: false,
      minCacheablePrefixTokens: 4096,
    },
  ],
  [
    // Haiku 4.5 — o tier escolhido em OQ-1. Sem effort, sem thinking
    // adaptativo, e o maior prefixo mínimo de cache da tabela.
    /^claude-haiku-4-5/u,
    {
      supportsEffort: false,
      supportsAdaptiveThinking: false,
      supportsServerFallback: false,
      minCacheablePrefixTokens: 4096,
    },
  ],
];

export function capabilitiesFor(model: string): ModelCapabilities {
  for (const [pattern, capabilities] of CAPABILITIES) {
    if (pattern.test(model)) return capabilities;
  }
  return CONSERVATIVE;
}
