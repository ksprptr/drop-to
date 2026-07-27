import type { Config } from 'prettier';

// Mirrors the root workspace config, adding the Tailwind class-sorting plugin (Prettier can't
// resolve a cross-file TS config import, so the shared options are repeated here).
const config: Config = {
  tabWidth: 2,
  printWidth: 100,
  endOfLine: 'auto',
  arrowParens: 'always',
  semi: true,
  singleQuote: true,
  jsxSingleQuote: true,
  bracketSameLine: true,
  plugins: ['prettier-plugin-tailwindcss'],
};

export default config;
