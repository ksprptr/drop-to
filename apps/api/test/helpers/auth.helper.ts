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
 * Builds an `accessToken` cookie header value for an authenticated request.
 */
export const accessCookie = (sub: string = TEST_USERNAME): string => `accessToken=${signAccessToken(sub)}`;

/**
 * Builds a `refreshToken` cookie header value. The refresh token is an opaque secret — the service
 * hashes it and looks it up, and the Prisma mock returns a live row regardless, so any value works.
 */
export const refreshCookie = (): string => `refreshToken=opaque-test-refresh-secret`;
