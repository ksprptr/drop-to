import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route as public, exempting it from the global API-key guard.
 *
 * Used for endpoints that the browser or Google hit directly and therefore
 * cannot send the API key (the OAuth redirect/callback and the health check).
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
