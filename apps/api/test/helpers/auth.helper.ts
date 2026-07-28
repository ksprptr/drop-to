import { JwtService } from '@nestjs/jwt';

// Matches AUTH_USERNAME in .env.test.
export const TEST_USERNAME = 'test-admin';

const jwtService = new JwtService();

/**
 * Signs an access token with the test secret (read from the env loaded by setup-env.ts).
 */
export const signAccessToken = (sub: string = TEST_USERNAME): string =>
  jwtService.sign({ sub, ver: 0 }, { secret: process.env['JWT_ACCESS_SECRET'], expiresIn: 3600 });

/**
 * Signs a refresh token with the test secret. `jti` matches the default row id returned by the
 * Prisma mock's `refreshToken.findUnique`, so the rotation lookup succeeds.
 */
export const signRefreshToken = (sub: string = TEST_USERNAME, jti = 'refresh-row-1'): string =>
  jwtService.sign(
    { sub, ver: 0, jti },
    { secret: process.env['JWT_REFRESH_SECRET'], expiresIn: 7 * 24 * 3600 },
  );

/**
 * Builds an `accessToken` cookie header value for an authenticated request.
 */
export const accessCookie = (sub: string = TEST_USERNAME): string => `accessToken=${signAccessToken(sub)}`;

/**
 * Builds a `refreshToken` cookie header value.
 */
export const refreshCookie = (sub: string = TEST_USERNAME): string =>
  `refreshToken=${signRefreshToken(sub)}`;
