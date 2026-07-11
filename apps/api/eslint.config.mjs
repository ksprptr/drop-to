import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import { defineConfig } from 'eslint/config';
import importPlugin from 'eslint-plugin-import';
import prettier from 'eslint-plugin-prettier';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import unusedImports from 'eslint-plugin-unused-imports';

export default defineConfig([
  {
    files: ['**/*.{ts,tsx}', '**/*.{js,jsx}', '**/*.mjs'],
    ignores: ['dist/**', 'src/prisma/generated/**'],
    languageOptions: {
      parser: tsParser,
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
      'no-await-in-loop': 'warn',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'prefer-promise-reject-errors': 'warn',
      'spaced-comment': 'error',
      'no-duplicate-imports': 'error',
      'no-use-before-define': 'off',
      '@typescript-eslint/no-shadow': 'error',
      '@typescript-eslint/no-use-before-define': 'error',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
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
      'import/no-named-as-default-member': 'warn',
    },
  },
]);
