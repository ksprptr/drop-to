import { Injectable } from '@nestjs/common';
import { Request } from 'express';
import { RateLimiterMemory } from 'rate-limiter-flexible';

import { RateLimitRule } from '../decorators/rate-limit.decorator';

interface GetLimiterParams {
  method: string;
  path: string;
  rule: RateLimitRule;
}

/** Resolves the subject key and caches one in-memory limiter per (method, path, rule). */
@Injectable()
export class RateLimitHelpers {
  private readonly limiterCache = new Map<string, RateLimiterMemory>();

  /**
   * Resolves the subject key (by IP), or null when the IP is unknown.
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
   * Gets or creates the limiter for a (method, path, rule) combination.
   **/
  getLimiter({ method, path, rule }: GetLimiterParams): RateLimiterMemory {
    const cacheKey = `${method}:${path}:${rule.points}:${rule.duration}`;
    const existing = this.limiterCache.get(cacheKey);

    if (existing) {
      return existing;
    }

    const limiter = new RateLimiterMemory({
      keyPrefix: `${method}:${path}`,
      points: rule.points,
      duration: rule.duration,
      blockDuration: rule.duration,
    });

    this.limiterCache.set(cacheKey, limiter);

    return limiter;
  }
}
