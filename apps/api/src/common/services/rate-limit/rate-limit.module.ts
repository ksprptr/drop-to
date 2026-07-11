import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { RateLimitGuard } from './guards/rate-limit.guard';
import { RateLimitHelpers } from './helpers/rate-limit.helpers';

/**
 * Class representing a rate limit module.
 *
 * Registers the RateLimitGuard globally so every route is limited (respecting
 * `@RateLimit` / `@SkipRateLimit`).
 */
@Global()
@Module({
  providers: [{ provide: APP_GUARD, useClass: RateLimitGuard }, RateLimitHelpers],
})
export class RateLimitModule {}
