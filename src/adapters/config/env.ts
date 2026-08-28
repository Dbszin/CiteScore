import { z } from 'zod';

/**
 * Validação de ambiente no boot.
 *
 * Descobrir chave ausente por 500 na primeira análise real é falha evitável:
 * falta de variável obrigatória derruba a inicialização, com mensagem clara.
 */
const intFromEnv = (fallback: number) =>
  z.coerce.number().int().positive().default(fallback);

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

  /** Defesa 3 — budget guard. */
  DAILY_TOKEN_BUDGET: intFromEnv(2_000_000),
  MAX_TOKENS_PER_REQUEST: intFromEnv(40_000),

  /** Defesa 1 — rate limit. */
  RATE_LIMIT_PER_HOUR: intFromEnv(10),

  FETCH_TIMEOUT_MS: intFromEnv(10_000),
  MAX_REDIRECTS: intFromEnv(3),

  /** ADR-004 exige que a metodologia seja acessível a um clique. */
  METHODOLOGY_URL: z.string().min(1).default('/metodologia'),

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
