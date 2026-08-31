import { describe, expect, it } from 'vitest';

import {
  CLASSIFICATION_OUTPUT_FORMAT,
  CLASSIFICATION_RESPONSE_SCHEMA_GEMINI,
  ClassificationBatchSchema,
  ClassificationItemSchema,
  SUGGESTION_OUTPUT_FORMAT,
  SuggestionItemSchema,
} from '../../../src/adapters/classify/schemas.js';

/**
 * O JSON Schema enviado à API e o schema Zod que valida a resposta descrevem
 * a MESMA estrutura, mas são declarados separadamente — porque o helper
 * `betaZodOutputFormat` do SDK exige Zod 4 e o projeto usa Zod 3.
 *
 * Duas declarações da mesma coisa divergem com o tempo. Este arquivo é o que
 * impede isso: se alguém acrescentar um campo em um lado e esquecer o outro,
 * o teste falha em vez de a API receber um formato que o validador rejeita.
 */

/** Extrai as propriedades do item de dentro de um `output_format`. */
function jsonItemProperties(format: {
  readonly schema: Record<string, unknown>;
}): { properties: Record<string, unknown>; required: string[] } {
  const properties = format.schema['properties'] as {
    items: { items: { properties: Record<string, unknown>; required: string[] } };
  };
  return {
    properties: properties.items.items.properties,
    required: properties.items.items.required,
  };
}

describe('Consistência entre JSON Schema e Zod — classificação', () => {
  const json = jsonItemProperties(CLASSIFICATION_OUTPUT_FORMAT);
  const zodKeys = Object.keys(ClassificationItemSchema.shape).sort();

  it('os campos são exatamente os mesmos', () => {
    expect(Object.keys(json.properties).sort()).toEqual(zodKeys);
  });

  it('todos os campos são obrigatórios nos dois lados', () => {
    expect([...json.required].sort()).toEqual(zodKeys);
  });

  it('o enum de categoria coincide com o do Zod', () => {
    const category = json.properties['category'] as { enum: string[] };
    const zodEnum = [...ClassificationItemSchema.shape.category.options].sort();
    expect([...category.enum].sort()).toEqual(zodEnum);
  });

  it('não aceita campo extra — a API não deve inventar propriedade', () => {
    expect(CLASSIFICATION_OUTPUT_FORMAT.schema['additionalProperties']).toBe(false);
    const items = CLASSIFICATION_OUTPUT_FORMAT.schema.properties.items as {
      items: Record<string, unknown>;
    };
    expect(items.items['additionalProperties']).toBe(false);
  });

  it('NÃO tem campo de justificativa — é o lever de custo da ADR-005', () => {
    // A saída domina 92% do custo. Justificativa por sentença custaria ~35%
    // a mais de saída, e a explicação da UI vem dos signals do pré-filtro.
    expect(zodKeys).not.toContain('rationale');
    expect(zodKeys).not.toContain('reason');
    expect(zodKeys).not.toContain('justification');
    expect(Object.keys(json.properties)).not.toContain('rationale');
  });

  it('o tipo declarado é json_schema', () => {
    expect(CLASSIFICATION_OUTPUT_FORMAT.type).toBe('json_schema');
  });
});

/*
 * Agora sao TRES declaracoes da mesma estrutura: o Zod que valida a resposta,
 * o JSON Schema da Anthropic e o responseSchema do Gemini. Tres declaracoes
 * divergem ainda mais facil que duas — e a divergencia se manifesta como
 * CLASSIFIER_INVALID_OUTPUT apontando para a causa errada, com um provedor
 * devolvendo algo que o validador recusa.
 */
describe('Consistência do schema do Gemini', () => {
  const item = (
    CLASSIFICATION_RESPONSE_SCHEMA_GEMINI.properties.items as {
      items: {
        type: string;
        properties: Record<string, unknown>;
        required: string[];
        propertyOrdering: string[];
      };
    }
  ).items;
  const zodKeys = Object.keys(ClassificationItemSchema.shape).sort();

  it('os campos são exatamente os mesmos do Zod', () => {
    expect(Object.keys(item.properties).sort()).toEqual(zodKeys);
  });

  it('todos os campos são obrigatórios', () => {
    expect([...item.required].sort()).toEqual(zodKeys);
  });

  it('o enum de categoria coincide com o do Zod', () => {
    const category = item.properties['category'] as { enum: string[] };
    const zodEnum = [...ClassificationItemSchema.shape.category.options].sort();
    expect([...category.enum].sort()).toEqual(zodEnum);
  });

  it('usa tipos em MAIÚSCULA, que é o que a API do Google aceita', () => {
    // Enviar `object`/`array` minúsculo é rejeitado com 400. Um stub não pega
    // isso, porque stub não valida o schema que recebe.
    expect(CLASSIFICATION_RESPONSE_SCHEMA_GEMINI.type).toBe('OBJECT');
    expect(item.type).toBe('OBJECT');
  });

  it('NÃO envia `additionalProperties` — a API do Google rejeita', () => {
    expect(item).not.toHaveProperty('additionalProperties');
    expect(CLASSIFICATION_RESPONSE_SCHEMA_GEMINI).not.toHaveProperty(
      'additionalProperties',
    );
  });

  it('fixa a ordem das chaves', () => {
    // Sem `propertyOrdering` a ordem varia entre chamadas, e variação gratuita
    // é o oposto do que `temperature: 0` existe para dar.
    expect(item.propertyOrdering).toEqual(['id', 'category', 'confidence']);
  });

  it('NÃO tem campo de justificativa — mesmo lever de custo da ADR-005', () => {
    expect(Object.keys(item.properties)).not.toContain('rationale');
  });
});

describe('Consistência entre JSON Schema e Zod — sugestões', () => {
  const json = jsonItemProperties(SUGGESTION_OUTPUT_FORMAT);
  const zodKeys = Object.keys(SuggestionItemSchema.shape).sort();

  it('os campos são exatamente os mesmos', () => {
    expect(Object.keys(json.properties).sort()).toEqual(zodKeys);
  });

  it('todos os campos são obrigatórios nos dois lados', () => {
    expect([...json.required].sort()).toEqual(zodKeys);
  });
});

describe('Validação da resposta continua no Zod', () => {
  it('aceita payload bem formado', () => {
    const result = ClassificationBatchSchema.safeParse({
      items: [{ id: 0, category: 'SOURCED', confidence: 0.9 }],
    });
    expect(result.success).toBe(true);
  });

  it('rejeita categoria fora do enum', () => {
    const result = ClassificationBatchSchema.safeParse({
      items: [{ id: 0, category: 'MAYBE', confidence: 0.9 }],
    });
    expect(result.success).toBe(false);
  });

  it('rejeita confiança fora de 0..1', () => {
    expect(
      ClassificationBatchSchema.safeParse({
        items: [{ id: 0, category: 'SOURCED', confidence: 1.5 }],
      }).success,
    ).toBe(false);
  });

  it('rejeita id não inteiro', () => {
    expect(
      ClassificationBatchSchema.safeParse({
        items: [{ id: 1.5, category: 'SOURCED', confidence: 0.5 }],
      }).success,
    ).toBe(false);
  });

  it('rejeita null e undefined', () => {
    expect(ClassificationBatchSchema.safeParse(null).success).toBe(false);
    expect(ClassificationBatchSchema.safeParse(undefined).success).toBe(false);
  });
});
