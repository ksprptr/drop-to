import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_META_KEY = 'rate_limit:rule';

export type RateLimitRule = {
  points: number;
  duration: number;
  errorMessage?: string;
};

/**
 * Applies a per-route rate limit rule.
 **/
export const RateLimit = (rule: RateLimitRule) => SetMetadata(RATE_LIMIT_META_KEY, rule);
