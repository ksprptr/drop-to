import { Logger } from '@nestjs/common';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load the dedicated test environment before any module (and config) is evaluated.
config({ path: resolve(__dirname, '../.env.test'), override: true });

// Silence Nest's logger so test output stays readable (services log on success/error paths).
Logger.overrideLogger(false);

// The Drive provider reaches Google over raw `fetch`, which the googleapis mock does not cover; specs stub it themselves.
global.fetch = ((input: RequestInfo | URL): never => {
  const url =
    typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;

  throw new Error(
    `Unmocked outbound fetch to ${url}. Stub global.fetch in the test rather than calling a real service.`,
  );
}) as unknown as typeof fetch;
