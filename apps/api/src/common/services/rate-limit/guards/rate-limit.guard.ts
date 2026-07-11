import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  HttpException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';

import { type RateLimitConfig, rateLimitConfig } from '@/config/rate-limit.config';

import { RATE_LIMIT_META_KEY, RateLimitRule } from '../decorators/rate-limit.decorator';
import { SKIP_RATE_LIMIT_META_KEY } from '../decorators/skip-rate-limit.decorator';
import { RateLimitHelpers } from '../helpers/rate-limit.helpers';

/**
 * Class representing a rate limit guard.
 *
 * Applies a per-route `@RateLimit` rule (or a default) keyed by client IP.
 * Routes marked `@SkipRateLimit()` are never limited. Exceeding the limit → 429.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rateLimitHelpers: RateLimitHelpers,
    @Inject(rateLimitConfig.KEY) private readonly rateLimitCfg: RateLimitConfig,
  ) {}

  /**
   * Determines whether the request may proceed under the rate limit.
   * @param context - The execution context
   * @returns True when the request is within its limit
   * @throws BadRequestException when the client IP cannot be resolved
   * @throws HttpException (429) when the limit is exceeded
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.rateLimitCfg.enabled) {
      return true;
    }

    const handler = context.getHandler();
    const clazz = context.getClass();

    const skip =
      this.reflector.get<boolean>(SKIP_RATE_LIMIT_META_KEY, handler) ??
      this.reflector.get<boolean>(SKIP_RATE_LIMIT_META_KEY, clazz);

    if (skip) {
      return true;
    }

    const rule: RateLimitRule = this.reflector.get<RateLimitRule>(RATE_LIMIT_META_KEY, handler) ??
      this.reflector.get<RateLimitRule>(RATE_LIMIT_META_KEY, clazz) ?? {
        points: this.rateLimitCfg.defaultPoints,
        duration: this.rateLimitCfg.defaultDuration,
      };

    const req = context.switchToHttp().getRequest<Request>();
    const method = req.method?.toUpperCase() ?? 'UNKNOWN';
    const path = (req.route?.path as string | undefined) ?? req.path ?? 'UNKNOWN';

    const key = this.rateLimitHelpers.resolveSubjectKey(req);

    if (!key) {
      throw new BadRequestException('Unable to determine subject for rate limiting.');
    }

    const limiter = this.rateLimitHelpers.getLimiter({ method, path, rule });

    try {
      await limiter.consume(key);
      return true;
    } catch {
      throw new HttpException(rule.errorMessage || 'Too many requests, try again later.', 429);
    }
  }
}
