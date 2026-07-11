import { Injectable } from '@nestjs/common';
import { Request } from 'express';
import { RateLimiterMemory } from 'rate-limiter-flexible';

import { RateLimitRule } from '../decorators/rate-limit.decorator';

interface GetLimiterParams {
  method: string;
  path: string;
  rule: RateLimitRule;
}

/**
 * Class representing a rate limit helpers.
 *
 * Resolves the per-request subject key and caches one in-memory limiter per
 * (method, path, rule) so repeated requests reuse the same window. A single API
 * instance is assumed — no shared store is needed.
 */
@Injectable()
export class RateLimitHelpers {
  private readonly limiterCache = new Map<string, RateLimiterMemory>();

  /**
   * Function to resolve the rate-limit subject key from the request.
   * @param req - The incoming request
   * @returns The subject key (by IP), or null when the IP cannot be determined
   */
  resolveSubjectKey(req: Request): string | null {
    const ip = req.ip ? this.normalizeIp(req.ip) : null;

    return ip ? `ip:${ip}` : null;
  }

  /**
   * Function to normalize IPv4-mapped IPv6 addresses to plain IPv4.
   * @param ip - The raw IP address
   * @returns The normalized IP address
   */
  normalizeIp(ip: string): string {
    return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  }

  /**
   * Function to get or create the limiter for a (method, path, rule) combination.
   * @param params - The HTTP method, route path and rate-limit rule
   * @returns The in-memory rate limiter
   */
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
