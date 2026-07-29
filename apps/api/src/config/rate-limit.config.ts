import { registerAs } from '@nestjs/config';

// `enabled` is a kill-switch (RATE_LIMIT_ENABLED="false"); the rest is the default rule.
export const rateLimitConfig = registerAs('rateLimit', () => ({
  enabled: process.env['RATE_LIMIT_ENABLED'] !== 'false',
  defaultPoints: 300,
  defaultDuration: 60,
}));

export type RateLimitConfig = ReturnType<typeof rateLimitConfig>;
