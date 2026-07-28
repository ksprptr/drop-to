import { registerAs } from '@nestjs/config';

// Redis backs the rate limiter's shared store so limits hold across instances; auth is optional.
export const redisConfig = registerAs('redis', () => ({
  host: process.env['REDIS_HOST']!,
  port: parseInt(process.env['REDIS_PORT']!, 10),
  username: process.env['REDIS_USER'] || undefined,
  password: process.env['REDIS_PASS'] || undefined,
  keyPrefix: process.env['REDIS_KEY_PREFIX'] || 'dropto:rl:',
}));

export type RedisConfig = ReturnType<typeof redisConfig>;
