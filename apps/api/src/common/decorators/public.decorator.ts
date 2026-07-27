import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route public, exempting it from the global AuthGuard.
 **/
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
