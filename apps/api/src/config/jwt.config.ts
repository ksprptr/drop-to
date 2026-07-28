import { registerAs } from '@nestjs/config';

// Access-JWT signing secret; refresh tokens are opaque (hashed in DB), so no refresh secret needed.
export const jwtConfig = registerAs('jwt', () => ({
  accessSecret: process.env['JWT_ACCESS_SECRET']!,
}));

export type JwtConfig = ReturnType<typeof jwtConfig>;
