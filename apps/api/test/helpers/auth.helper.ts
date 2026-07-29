import { JwtService } from '@nestjs/jwt';
import { createCipheriv, randomBytes } from 'node:crypto';

// Matches AUTH_USERNAME in .env.test.
export const TEST_USERNAME = 'test-admin';

const jwtService = new JwtService();

/**
 * Signs an access token with the test secret (read from the env loaded by setup-env.ts).
 **/
export const signAccessToken = (sub: string = TEST_USERNAME): string =>
  jwtService.sign({ sub, ver: 0 }, { secret: process.env['JWT_ACCESS_SECRET'], expiresIn: 3600 });

/**
 * Builds an `accessToken` cookie header value for an authenticated request.
 **/
export const accessCookie = (sub: string = TEST_USERNAME): string =>
  `accessToken=${signAccessToken(sub)}`;

/**
 * Builds a `refreshToken` cookie header value (any opaque value works — the mock returns a live row).
 **/
export const refreshCookie = (): string => `refreshToken=opaque-test-refresh-secret`;

/**
 * Builds a `driveOwner` cookie proving ownership of `email` (AES-256-GCM, matching CryptoService).
 **/
export const ownerCookie = (email: string): string => {
  const key = Buffer.from(process.env['TOKEN_ENCRYPTION_KEY']!, 'hex');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const payload = JSON.stringify({ email, exp: Date.now() + 60_000 });
  const encrypted = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]);
  const token = [
    iv.toString('hex'),
    cipher.getAuthTag().toString('hex'),
    encrypted.toString('hex'),
  ].join(':');

  return `driveOwner=${token}`;
};
