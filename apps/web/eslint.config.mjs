import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import { defineConfig } from 'eslint/config';
import importPlugin from 'eslint-plugin-import';
import prettier from 'eslint-plugin-prettier';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import unusedImports from 'eslint-plugin-unused-imports';

export default defineConfig([
  {
    files: ['**/*.{ts,tsx}'],
    ignores: ['.next/**', 'node_modules/**'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      prettier,
      import: importPlugin,
      'unused-imports': unusedImports,
      'simple-import-sort': simpleImportSort,
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      semi: 'error',
      'no-duplicate-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'error',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
        },
      ],
      'simple-import-sort/imports': [
        'error',
        {
          groups: [['^\\u0000', '^@?\\w'], ['^@/'], ['^\\.'], ['^.+\\.(css|scss)$']],
        },
      ],
      'simple-import-sort/exports': 'error',
    },
  },
]);
