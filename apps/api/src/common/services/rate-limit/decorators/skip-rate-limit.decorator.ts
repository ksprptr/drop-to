import { SetMetadata } from '@nestjs/common';

export const SKIP_RATE_LIMIT_META_KEY = 'rate_limit:skip';

/**
 * Marks a route (or controller) exempt from the rate limiter.
 **/
export const SkipRateLimit = () => SetMetadata(SKIP_RATE_LIMIT_META_KEY, true);
