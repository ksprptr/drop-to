import { registerAs } from '@nestjs/config';

/**
 * The single operator account. This app authorizes exactly one person, so the
 * credentials live in the environment instead of a user database.
 */
export const authConfig = registerAs('auth', () => ({
  username: process.env['AUTH_USERNAME']!,
  password: process.env['AUTH_PASSWORD']!,
  // Optional: set to a parent domain to share the auth cookies across subdomains.
  // Leave unset for host-only cookies (correct for localhost and single-host deploys).
  cookieDomain: process.env['COOKIE_DOMAIN'] || undefined,
}));

export type AuthConfig = ReturnType<typeof authConfig>;
