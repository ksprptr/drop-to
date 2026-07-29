import type { Config } from 'prettier';

// Shared Prettier config for the whole workspace (apps inherit it; web adds the Tailwind plugin).
const config: Config = {
  tabWidth: 2,
  printWidth: 100,
  endOfLine: 'auto',
  arrowParens: 'always',
  semi: true,
  singleQuote: true,
  jsxSingleQuote: true,
  bracketSameLine: true,
};

export default config;
