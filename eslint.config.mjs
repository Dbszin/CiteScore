import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * ADR-001 exige que src/core/** permaneça puro: sem Next, sem SDK da Anthropic,
 * sem biblioteca de DOM. A regra abaixo transforma essa disciplina em algo
 * verificado pela máquina, em vez de depender da memória de quem revisa.
 */
const INFRA_MODULES = [
  'next',
  'next/*',
  'react',
  'react-dom',
  '@anthropic-ai/sdk',
  '@anthropic-ai/sdk/*',
  '@mozilla/readability',
  'jsdom',
  'linkedom',
  'node:fs',
  'node:http',
  'node:https',
  'fs',
  'http',
  'https',
];

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'scripts/benchmarks/**',
      'next-env.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      eqeqeq: ['error', 'always'],
      'no-console': 'off',
    },
  },
  {
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: INFRA_MODULES,
              message:
                'ADR-001: src/core deve permanecer puro. Dependência externa entra por porta em src/core/ports, implementada em src/adapters.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/components/**/*.tsx', 'src/app/**/*.tsx'],
    rules: {
      // ui-relatorio/spec.md: o texto extraído é conteúdo de terceiros.
      // Renderizar como texto, nunca como HTML. Este é o vetor de XSS do produto.
      'react/no-danger': 'off',
      'no-restricted-syntax': [
        'error',
        {
          selector: 'JSXAttribute[name.name="dangerouslySetInnerHTML"]',
          message:
            'ui-relatorio/spec.md: o conteúdo extraído é entrada não confiável. Renderize como texto.',
        },
      ],
    },
  },
);
