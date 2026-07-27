import { registerAs } from '@nestjs/config';

// JWT signing secrets; token lifetimes are fixed constants in the auth helpers.
export const jwtConfig = registerAs('jwt', () => ({
  accessSecret: process.env['JWT_ACCESS_SECRET']!,
  refreshSecret: process.env['JWT_REFRESH_SECRET']!,
}));

export type JwtConfig = ReturnType<typeof jwtConfig>;
