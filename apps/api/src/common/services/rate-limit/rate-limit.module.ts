import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { RateLimitGuard } from './guards/rate-limit.guard';
import { RateLimitHelpers } from './helpers/rate-limit.helpers';

/** Registers RateLimitGuard globally. */
@Global()
@Module({
  providers: [{ provide: APP_GUARD, useClass: RateLimitGuard }, RateLimitHelpers],
})
export class RateLimitModule {}
