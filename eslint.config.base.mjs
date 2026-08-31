import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import unusedImports from 'eslint-plugin-unused-imports';

// Shared ESLint flat-config building blocks for every workspace project (api + web).
export const parser = tsParser;

export const plugins = {
  'unused-imports': unusedImports,
  'simple-import-sort': simpleImportSort,
  '@typescript-eslint': tsPlugin,
};

export const rules = {
  semi: 'error',
  'no-eval': 'error',
  'no-implied-eval': 'error',
  'no-await-in-loop': 'warn',
  'prefer-promise-reject-errors': 'warn',
  'spaced-comment': 'error',
  'no-duplicate-imports': 'error',
  'no-use-before-define': 'off',
  '@typescript-eslint/no-shadow': 'error',
  // Function declarations hoist, so using them before their definition is fine.
  '@typescript-eslint/no-use-before-define': ['error', { functions: false }],
  '@typescript-eslint/explicit-function-return-type': 'off',
  '@typescript-eslint/explicit-module-boundary-types': 'off',
  '@typescript-eslint/no-explicit-any': 'off',
  '@typescript-eslint/no-unused-vars': 'off',
  'no-unused-vars': 'off',
  'unused-imports/no-unused-imports': 'error',
  'unused-imports/no-unused-vars': [
    'error',
    { vars: 'all', varsIgnorePattern: '^_', args: 'after-used', argsIgnorePattern: '^_' },
  ],
  'simple-import-sort/imports': [
    'error',
    { groups: [['^\\u0000', '^@?\\w'], ['^@/'], ['^\\.'], ['^.+\\.(css|scss)$']] },
  ],
  'simple-import-sort/exports': 'error',
};
