import { z } from 'zod';

/**
 * Validação de ambiente no boot.
 *
 * Descobrir chave ausente por 500 na primeira análise real é falha evitável:
 * falta de variável obrigatória derruba a inicialização, com mensagem clara.
 */
const intFromEnv = (fallback: number) =>
  z.coerce.number().int().positive().default(fallback);

const dollarsFromEnv = (fallback: number) =>
  z.coerce.number().positive().default(fallback);

const EnvSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1, 'ANTHROPIC_API_KEY é obrigatória'),

  /**
   * ADR-005 / OQ-1: ponto único de troca de tier.
   * `claude-opus-5` é o default; descer de tier troca dinheiro por qualidade
   * de classificação e é decisão do usuário, não da arquitetura.
   */
  ANTHROPIC_MODEL: z.string().min(1).default('claude-opus-5'),

  /** Caps de conteúdo — defesa 2 de protecao-custo/spec.md. */
  MAX_CONTENT_BYTES: intFromEnv(2_000_000),
  MAX_ANALYZABLE_SENTENCES: intFromEnv(400),
  MAX_SENTENCES_PER_LLM_CALL: intFromEnv(80),

  /**
   * Defesa 3 — budget guard, denominado em DÓLARES.
   *
   * A versão anterior contava tokens de ENTRADA (`DAILY_TOKEN_BUDGET`), e isso
   * media a coisa errada: no `claude-haiku-4-5` a entrada custa US$1/MTok e a
   * saída US$5/MTok. Na análise real medida — 4.244 de entrada, 2.261 de saída
   * — a SAÍDA respondeu por 73% do custo. Um teto sobre a entrada limita a
   * parte barata do gasto.
   *
   * Pior: 2.000.000 tokens de entrada valem US$2,00, contra o teto de US$1,00
   * aprovado. O parâmetro contradizia a decisão.
   */
  DAILY_BUDGET_USD: dollarsFromEnv(1.0),
  MAX_REQUEST_BUDGET_USD: dollarsFromEnv(0.1),

  /** Preços do modelo, explícitos em vez de embutidos no código. */
  MODEL_INPUT_USD_PER_MTOK: dollarsFromEnv(1.0),
  MODEL_OUTPUT_USD_PER_MTOK: dollarsFromEnv(5.0),

  /**
   * Saída estimada como fração da entrada, para o pré-flight.
   *
   * MEDIDO: 2.261/4.244 = 0,53. O default carrega margem porque subestimar
   * aqui é exatamente a falha que o guard existe para prevenir — errar para
   * cima recusa análise que caberia; errar para baixo fura o teto.
   */
  BUDGET_OUTPUT_RATIO: z.coerce.number().positive().default(0.7),

  /** Defesa 1 — rate limit. */
  RATE_LIMIT_PER_HOUR: intFromEnv(10),

  FETCH_TIMEOUT_MS: intFromEnv(10_000),
  MAX_REDIRECTS: intFromEnv(3),

  /** ADR-004 exige que a metodologia seja acessível a um clique. */
  /*
   * O default aponta para a secao "O que nao medimos" da propria pagina, que
   * EXISTE. O default anterior era `/metodologia`, uma rota que nunca foi
   * criada — ou seja, o link "Ler o metodo" no painel de resultado dava 404, e
   * a ADR-004 item 4 exige que a metodologia esteja a um clique do resultado.
   *
   * A secao na pagina satisfaz PARCIALMENTE: ela diz o que nao e' medido e por
   * que o composto nao e' figura principal, mas nao lista os sinais nem a
   * formula. A pagina dedicada esta registrada como debito em tasks.md.
   */
  METHODOLOGY_URL: z.string().min(1).default('/#metodo'),

  /** M4: contadores fora do processo. Ausente em dev — usa adapters locais. */
  REDIS_URL: z.string().optional(),
  REDIS_TOKEN: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

/** Aceita qualquer mapa de variaveis; `process.env` e atribuivel a isto. */
export type EnvSource = Record<string, string | undefined>;

export function loadEnv(source: EnvSource = process.env): Env {
  if (cached !== null) return cached;

  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(
      `Configuração de ambiente inválida:\n${details}\n\n` +
        'Copie .env.example para .env.local e preencha os valores.',
    );
  }

  cached = parsed.data;
  return cached;
}

/** Só para teste: descarta o cache entre casos. */
export function resetEnvCache(): void {
  cached = null;
}
