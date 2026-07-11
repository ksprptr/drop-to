import { SetMetadata } from '@nestjs/common';

export const SKIP_RATE_LIMIT_META_KEY = 'rate_limit:skip';

/**
 * Marks a route (or controller) as exempt from the rate limiter. Used for
 * always-available endpoints such as the health check.
 */
export const SkipRateLimit = () => SetMetadata(SKIP_RATE_LIMIT_META_KEY, true);
