import { z } from 'zod';

/**
 * Schemas de structured output.
 *
 * Nenhum campo de justificativa por sentença — é o lever de −35% de saída
 * da ADR-005, e a saída domina 92% do custo. A explicação exibida na UI vem
 * dos `signals` do pré-filtro, que são gratuitos.
 */

export const ClassificationItemSchema = z.object({
  /** Índice da sentença, exatamente como veio numerado no prompt. */
  id: z.number().int(),
  category: z.enum(['SOURCED', 'UNSOURCED', 'OPINION']),
  confidence: z.number().min(0).max(1),
});

export const ClassificationBatchSchema = z.object({
  items: z.array(ClassificationItemSchema),
});

export const SuggestionItemSchema = z.object({
  id: z.number().int(),
  /** O que está faltando, em linguagem de quem escreve. */
  issue: z.string().min(1),
  /** Ação concreta de reescrita. */
  action: z.string().min(1),
});

export const SuggestionBatchSchema = z.object({
  items: z.array(SuggestionItemSchema),
});

export type ClassificationBatch = z.infer<typeof ClassificationBatchSchema>;
export type SuggestionBatch = z.infer<typeof SuggestionBatchSchema>;

/**
 * JSON Schema explicito para `output_format` da Messages API.
 *
 * POR QUE NAO USAR O HELPER `betaZodOutputFormat`: ele chama
 * `z.toJSONSchema()`, funcao que so existe no **Zod 4**. O projeto usa Zod
 * 3.25.x, e o helper lanca `TypeError: z.toJSONSchema is not a function`.
 * Verificado em execucao, nao presumido.
 *
 * Manter o schema explicito e a escolha de menor risco: atualizar o Zod para
 * a v4 no meio da implementacao mexeria tambem em `config/env.ts` e nos
 * outros schemas, com breaking changes, para ganhar apenas geracao
 * automatica de algo que sao 20 linhas.
 *
 * A validacao Zod continua onde importa — na RESPOSTA, via
 * `ClassificationBatchSchema.safeParse`. O JSON Schema abaixo apenas informa
 * a API do formato esperado; ele nao substitui a validacao.
 *
 * INVARIANTE: este schema e o Zod acima descrevem a mesma estrutura. Ha
 * teste garantindo que nao divirjam.
 */
export const CLASSIFICATION_OUTPUT_FORMAT = {
  type: 'json_schema' as const,
  schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            category: { type: 'string', enum: ['SOURCED', 'UNSOURCED', 'OPINION'] },
            // Sem `minimum`/`maximum`: a API rejeita esses campos para tipo
            // `number` com 400 ("properties maximum, minimum are not
            // supported"). Descoberto na verificação real — o teste com stub
            // não pegaria, porque o stub não valida o schema enviado.
            // A faixa 0..1 continua garantida pelo Zod na RESPOSTA, que é
            // onde ela protege de verdade.
            confidence: { type: 'number' },
          },
          required: ['id', 'category', 'confidence'],
          additionalProperties: false,
        },
      },
    },
    required: ['items'],
    additionalProperties: false,
  },
};

export const SUGGESTION_OUTPUT_FORMAT = {
  type: 'json_schema' as const,
  schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            issue: { type: 'string' },
            action: { type: 'string' },
          },
          required: ['id', 'issue', 'action'],
          additionalProperties: false,
        },
      },
    },
    required: ['items'],
    additionalProperties: false,
  },
};

/**
 * O MESMO schema, na forma que a Generative Language API do Google aceita.
 *
 * Diferenças que NÃO são estilo — cada uma quebra a requisição se ignorada:
 *  - Tipos em MAIÚSCULA (`OBJECT`, `ARRAY`), não `object`/`array`
 *  - Não aceita `additionalProperties`; enviar rejeita com 400
 *  - `propertyOrdering` é o que fixa a ordem das chaves na saída. Sem ele a
 *    ordem varia entre chamadas, e variação gratuita é o oposto do que
 *    `temperature: 0` existe para dar
 *
 * INVARIANTE: descreve a mesma estrutura de `ClassificationBatchSchema` e de
 * `CLASSIFICATION_OUTPUT_FORMAT`. Há teste garantindo que os três não
 * divirjam — se divergirem, um provedor passa a devolver algo que o Zod
 * recusa, e o sintoma aparece como CLASSIFIER_INVALID_OUTPUT apontando para
 * a causa errada.
 */
export const CLASSIFICATION_RESPONSE_SCHEMA_GEMINI = {
  type: 'OBJECT' as const,
  properties: {
    items: {
      type: 'ARRAY' as const,
      items: {
        type: 'OBJECT' as const,
        properties: {
          id: { type: 'INTEGER' as const },
          category: {
            type: 'STRING' as const,
            enum: ['SOURCED', 'UNSOURCED', 'OPINION'],
          },
          confidence: { type: 'NUMBER' as const },
        },
        required: ['id', 'category', 'confidence'],
        propertyOrdering: ['id', 'category', 'confidence'],
      },
    },
  },
  required: ['items'],
};
