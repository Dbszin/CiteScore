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
  /**
   * Qual provedor classifica. `gemini` é o default porque tem cota gratuita
   * real, e o produto precisa poder ficar público sem custo por análise.
   *
   * A troca é barata porque `ClaimClassifier` é uma PORTA (ADR-001): trocar de
   * provedor é escrever um adapter, não reescrever o motor. O Claude continua
   * inteiro e testado — é o caminho comprovado, e vira `LLM_PROVIDER=anthropic`.
   */
  LLM_PROVIDER: z.enum(['gemini', 'anthropic']).default('gemini'),

  /*
   * As chaves são OPCIONAIS no schema e exigidas depois, conforme o provedor
   * escolhido (ver `superRefine` abaixo).
   *
   * Marcar as duas como obrigatórias faria quem usa Gemini precisar de uma
   * chave da Anthropic para o boot passar — exigir credencial de um serviço
   * que não vai ser chamado.
   */
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  GEMINI_API_KEY: z.string().min(1).optional(),

  /**
   * ADR-005 / OQ-1: ponto único de troca de tier.
   * Descer de tier troca dinheiro por qualidade de classificação e é decisão
   * do usuário, não da arquitetura.
   */
  ANTHROPIC_MODEL: z.string().min(1).default('claude-opus-5'),

  /**
   * O modelo do Gemini.
   *
   * É variável de ambiente, e não constante no código, porque MODELO SE
   * APOSENTA. Não é precaução teórica: o default anterior era
   * `gemini-2.0-flash`, e o provedor o retirou durante o desenvolvimento — a
   * API passou a devolver 404. Um deploy com o nome cravado no código teria
   * quebrado sem caminho de conserto que não fosse novo release.
   *
   * `gemini-2.5-flash` foi verificado contra a API real. NÃO se usa alias como
   * `gemini-flash-latest` de propósito: alias troca o modelo por baixo, e este
   * produto fixou `temperature: 0` justamente para o mesmo texto dar o mesmo
   * resultado. Um modelo que muda sozinho reintroduz a variação pela porta dos
   * fundos.
   */
  GEMINI_MODEL: z.string().min(1).default('gemini-2.5-flash'),

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
   * A rota `/metodologia` agora EXISTE, e cumpre os tres itens que a ADR-004
   * pede: quais sinais, como o score e' calculado, o que nao foi medido.
   *
   * Historico que vale ficar: este default apontou para `/metodologia` quando
   * a rota nao existia — o link "Ler o metodo" dava 404 — e depois para
   * `/#metodo`, uma secao que cobria so' o terceiro item. Agora o destino e' a
   * pagina de verdade.
   */
  METHODOLOGY_URL: z.string().min(1).default('/metodologia'),

  /** M4: contadores fora do processo. Ausente em dev — usa adapters locais. */
  REDIS_URL: z.string().optional(),
  REDIS_TOKEN: z.string().optional(),
})
  /*
   * A chave exigida é a do provedor ESCOLHIDO, e a falta dela derruba o boot
   * com mensagem que diz qual falta — em vez de 500 na primeira análise real.
   */
  .superRefine((env, ctx) => {
    if (env.LLM_PROVIDER === 'gemini' && env.GEMINI_API_KEY === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['GEMINI_API_KEY'],
        message: 'GEMINI_API_KEY é obrigatória quando LLM_PROVIDER=gemini',
      });
    }
    if (env.LLM_PROVIDER === 'anthropic' && env.ANTHROPIC_API_KEY === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ANTHROPIC_API_KEY'],
        message: 'ANTHROPIC_API_KEY é obrigatória quando LLM_PROVIDER=anthropic',
      });
    }
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
