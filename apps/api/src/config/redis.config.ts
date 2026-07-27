import { registerAs } from '@nestjs/config';

// Redis backs the rate limiter's shared store (so limits/lockouts hold across instances and survive
// redeploys). Only host/port are required; auth is optional for a local/trusted Redis.
export const redisConfig = registerAs('redis', () => ({
  host: process.env['REDIS_HOST']!,
  port: parseInt(process.env['REDIS_PORT']!, 10),
  username: process.env['REDIS_USER'] || undefined,
  password: process.env['REDIS_PASS'] || undefined,
  keyPrefix: process.env['REDIS_KEY_PREFIX'] || 'dropto:rl:',
}));

export type RedisConfig = ReturnType<typeof redisConfig>;
