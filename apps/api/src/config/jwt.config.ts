import { registerAs } from '@nestjs/config';

/**
 * JWT signing secrets. Token lifetimes are fixed constants in the auth helpers
 * (this app has no settings store); only the secrets live in the environment.
 */
export const jwtConfig = registerAs('jwt', () => ({
  accessSecret: process.env['JWT_ACCESS_SECRET']!,
  refreshSecret: process.env['JWT_REFRESH_SECRET']!,
}));

export type JwtConfig = ReturnType<typeof jwtConfig>;
