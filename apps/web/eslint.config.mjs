import nextPlugin from '@next/eslint-plugin-next';
import { defineConfig } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';

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
    plugins: { ...plugins, 'react-hooks': reactHooks, '@next/next': nextPlugin },
    rules: {
      ...rules,
      ...nextPlugin.configs.recommended.rules,

      // The two correctness rules this app actually needs: it is hook-heavy (several custom hooks
      // plus a dozen memoized callbacks per pane), and a missing dependency there is a stale
      // closure that only shows up at runtime.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',

      // The React Compiler rules that ship with eslint-plugin-react-hooks v7 stay off: they flag
      // this codebase's deliberate, commented patterns (writing a ref during render to break a
      // dependency cycle; setting state in an effect to restore one-shot UI from localStorage).
      // Satisfying them means restructuring working code, not cleaning it — a separate decision.

      // Preview images come from an authenticated, same-origin streaming route with unknown
      // dimensions, which next/image cannot optimize; a plain <img> is correct here.
      '@next/next/no-img-element': 'off',
    },
  },
]);
