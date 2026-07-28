import { Inject, Injectable } from '@nestjs/common';
import { Request } from 'express';
import Redis from 'ioredis';
import { RateLimiterMemory, RateLimiterRedis } from 'rate-limiter-flexible';

import { RateLimitRule } from '../decorators/rate-limit.decorator';
import { REDIS_RATE_LIMIT } from '../rate-limit.constants';

interface GetLimiterParams {
  method: string;
  path: string;
  rule: RateLimitRule;
}

/**
 * Resolves the subject key and caches one Redis-backed limiter per (method, path, rule).
 **/
@Injectable()
export class RateLimitHelpers {
  private readonly limiterCache = new Map<string, RateLimiterRedis>();

  constructor(@Inject(REDIS_RATE_LIMIT) private readonly redis: Redis) {}

  /**
   * Resolves the subject key (by IP), or null when the IP is unknown.
   *
   * FUTURE: (heavy exposure) this is per-IP only — a distributed/botnet brute force rotating IPs
   * isn't capped. If the app becomes widely exposed, add an account-level lockout (a counter keyed
   * on the login subject, not the IP) as a second limiter on /auth/login, and/or lean on a
   * Cloudflare Rate Limiting Rule. (Weigh the lockout-as-DoS risk on the single shared account.)
   **/
  resolveSubjectKey(req: Request): string | null {
    const ip = req.ip ? this.normalizeIp(req.ip) : null;

    return ip ? `ip:${ip}` : null;
  }

  /**
   * Normalizes IPv4-mapped IPv6 addresses to plain IPv4.
   **/
  normalizeIp(ip: string): string {
    return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  }

  /**
   * Gets or creates the limiter for a (method, path, rule) combination. Redis-backed so limits are
   * shared across instances; an in-memory insurance limiter keeps it working if Redis is down.
   **/
  getLimiter({ method, path, rule }: GetLimiterParams): RateLimiterRedis {
    const blockDuration = rule.blockDuration ?? rule.duration;
    const cacheKey = `${method}:${path}:${rule.points}:${rule.duration}:${blockDuration}`;
    const existing = this.limiterCache.get(cacheKey);

    if (existing) {
      return existing;
    }

    const limiter = new RateLimiterRedis({
      storeClient: this.redis,
      keyPrefix: `${method}:${path}`,
      points: rule.points,
      duration: rule.duration,
      blockDuration,
      insuranceLimiter: new RateLimiterMemory({
        keyPrefix: `${method}:${path}`,
        points: rule.points,
        duration: rule.duration,
        blockDuration,
      }),
    });

    this.limiterCache.set(cacheKey, limiter);

    return limiter;
  }
}
