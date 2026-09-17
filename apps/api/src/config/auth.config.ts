import { registerAs } from '@nestjs/config';

export const authConfig = registerAs('auth', () => ({
  // A bcrypt hash, never the plaintext — the password itself never reaches the env or the logs.
  passwordHash: process.env['AUTH_PASSWORD']!,
  // Parent domain to share auth cookies across subdomains; unset = host-only.
  cookieDomain: process.env['COOKIE_DOMAIN'] || undefined,
}));

export type AuthConfig = ReturnType<typeof authConfig>;
