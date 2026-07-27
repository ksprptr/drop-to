import { registerAs } from '@nestjs/config';

export const authConfig = registerAs('auth', () => ({
  username: process.env['AUTH_USERNAME']!,
  password: process.env['AUTH_PASSWORD']!,
  // Parent domain to share auth cookies across subdomains; unset = host-only.
  cookieDomain: process.env['COOKIE_DOMAIN'] || undefined,
}));

export type AuthConfig = ReturnType<typeof authConfig>;
