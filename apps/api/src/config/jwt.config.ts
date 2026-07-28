import { registerAs } from '@nestjs/config';

// Access-JWT signing secret; lifetime is a fixed constant in the auth helpers. Refresh tokens are
// opaque secrets stored hashed in the DB, so they need no signing secret.
export const jwtConfig = registerAs('jwt', () => ({
  accessSecret: process.env['JWT_ACCESS_SECRET']!,
}));

export type JwtConfig = ReturnType<typeof jwtConfig>;
