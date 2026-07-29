import { defineConfig } from 'eslint/config';

import { parser, plugins, rules } from '../../eslint.config.base.mjs';

export default defineConfig([
  {
    files: ['**/*.{ts,tsx}'],
    ignores: ['.next/**', 'node_modules/**'],
    languageOptions: {
      parser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins,
    rules,
  },
]);
