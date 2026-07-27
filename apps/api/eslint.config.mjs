import { defineConfig } from 'eslint/config';

import { parser, plugins, rules } from '../../eslint.config.base.mjs';

export default defineConfig([
  {
    files: ['**/*.{ts,tsx}', '**/*.{js,jsx}', '**/*.mjs'],
    ignores: ['dist/**', 'src/prisma/generated/**'],
    languageOptions: {
      parser,
    },
    plugins,
    rules,
  },
]);
