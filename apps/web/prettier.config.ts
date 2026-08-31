import type { Config } from 'prettier';

import baseConfig from '../../prettier.config.ts';

// The workspace config plus the Tailwind class-sorting plugin (web-only).
const config: Config = {
  ...baseConfig,
  plugins: ['prettier-plugin-tailwindcss'],
};

export default config;
