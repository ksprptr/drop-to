import { Global, Logger, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import Redis from 'ioredis';

import { type RedisConfig, redisConfig } from '@/config/redis.config';

import { RateLimitGuard } from './guards/rate-limit.guard';
import { RateLimitHelpers } from './helpers/rate-limit.helpers';
import { REDIS_RATE_LIMIT } from './rate-limit.constants';

/**
 * Registers RateLimitGuard globally + the shared ioredis client backing the limiter.
 **/
@Global()
@Module({
  providers: [
    {
      provide: REDIS_RATE_LIMIT,
      inject: [redisConfig.KEY],
      useFactory: (cfg: RedisConfig): Redis => {
        const logger = new Logger('RateLimitRedis');
        let loggedError = false;

        // lazyConnect: don't dial Redis at boot (Redis-less dev/test still starts); the insurance in-memory limiter covers a Redis outage.
        const client = new Redis({
          host: cfg.host,
          port: cfg.port,
          username: cfg.username,
          password: cfg.password,
          keyPrefix: cfg.keyPrefix,
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
        });

        client.on('error', (error: Error) => {
          if (!loggedError) {
            logger.warn(
              `Redis unavailable, rate limiting falls back to in-memory: ${error.message}`,
            );
            loggedError = true;
          }
        });
        client.on('ready', () => {
          loggedError = false;
        });

        return client;
      },
    },
    { provide: APP_GUARD, useClass: RateLimitGuard },
    RateLimitHelpers,
  ],
})
export class RateLimitModule {}
