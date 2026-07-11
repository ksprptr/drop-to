import type { Config } from 'prettier';

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
