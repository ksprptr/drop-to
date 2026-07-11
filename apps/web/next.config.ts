import path from 'node:path';

import type { NextConfig } from 'next';

const monorepoRoot = path.join(__dirname, '../..');

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle for the Docker image.
  output: 'standalone',
  // Trace files from the monorepo root so workspace deps are bundled.
  outputFileTracingRoot: monorepoRoot,
  // Transpile the workspace types package consumed from source.
  transpilePackages: ['@dropto/types'],
  // Keep Turbopack's root aligned with the file-tracing root.
  turbopack: {
    root: monorepoRoot,
  },
};

export default nextConfig;
