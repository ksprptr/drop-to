import { registerAs } from '@nestjs/config';

/**
 * Rate limiter configuration. `enabled` is a kill-switch (set RATE_LIMIT_ENABLED
 * to "false" to turn limiting off); the default rule applies to any route without
 * its own `@RateLimit` decorator.
 */
export const rateLimitConfig = registerAs('rateLimit', () => ({
  enabled: process.env['RATE_LIMIT_ENABLED'] !== 'false',
  defaultPoints: 300,
  defaultDuration: 60,
}));

export type RateLimitConfig = ReturnType<typeof rateLimitConfig>;
