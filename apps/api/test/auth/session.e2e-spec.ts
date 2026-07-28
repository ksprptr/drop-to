import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { accessCookie, refreshCookie, TEST_USERNAME } from '../helpers/auth.helper';
import { createPrismaMock, PrismaMock, resetPrismaMock } from '../helpers/prisma.mock';
import { createTestApp } from '../helpers/test-app.helper';

jest.mock('googleapis', () => require('../helpers/googleapis.mock').createGoogleApisMock());

// Matches AUTH_USERNAME / AUTH_PASSWORD in .env.test.
const CREDENTIALS = { username: 'test-admin', password: 'test-password' };

/**
 * Asserts a Set-Cookie header array contains a cookie of the given name.
 */
const hasCookie = (setCookie: string[] | undefined, name: string): boolean =>
  Array.isArray(setCookie) && setCookie.some((c) => c.startsWith(`${name}=`));

describe('Auth session (integration)', () => {
  let app: INestApplication;
  const prisma: PrismaMock = createPrismaMock();

  beforeAll(async () => {
    app = await createTestApp(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    resetPrismaMock(prisma);
  });

  describe('POST /api/v1/auth/login', () => {
    it('sets the access and refresh cookies on valid credentials', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send(CREDENTIALS);

      expect(res.status).toBe(200);
      const setCookie = res.headers['set-cookie'] as unknown as string[];
      expect(hasCookie(setCookie, 'accessToken')).toBe(true);
      expect(hasCookie(setCookie, 'refreshToken')).toBe(true);
    });

    it('rejects invalid credentials with 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ username: 'test-admin', password: 'wrong' });

      expect(res.status).toBe(401);
      expect(res.headers['set-cookie']).toBeUndefined();
    });

    it('rejects a malformed payload with 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ username: 'test-admin' });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('returns the operator for a valid access cookie', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Cookie', accessCookie());

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ username: TEST_USERNAME });
    });

    it('rejects a request without an access cookie (401)', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/auth/me');

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    it('issues a fresh token pair from a valid refresh cookie', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', refreshCookie());

      expect(res.status).toBe(200);
      const setCookie = res.headers['set-cookie'] as unknown as string[];
      expect(hasCookie(setCookie, 'accessToken')).toBe(true);
      expect(hasCookie(setCookie, 'refreshToken')).toBe(true);
    });

    it('rejects a missing refresh cookie with 401', async () => {
      const res = await request(app.getHttpServer()).post('/api/v1/auth/refresh');

      expect(res.status).toBe(401);
    });

    it('rejects an unknown token id (pruned/never issued) with 401', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', refreshCookie());

      expect(res.status).toBe(401);
    });

    it('detects reuse of an already-rotated token and revokes every session (401)', async () => {
      // The presented token's row is already revoked → replay is treated as theft.
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'refresh-row-1',
        subject: TEST_USERNAME,
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', refreshCookie());

      expect(res.status).toBe(401);
      // Every live session revoked + token version bumped (kills outstanding access tokens).
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { subject: TEST_USERNAME, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(prisma.authState.upsert).toHaveBeenCalled();
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('clears the auth cookies and returns 200', async () => {
      const res = await request(app.getHttpServer()).post('/api/v1/auth/logout');

      expect(res.status).toBe(200);
      const setCookie = (res.headers['set-cookie'] as unknown as string[]).join(';');
      expect(setCookie).toContain('accessToken=');
      expect(setCookie).toContain('Max-Age=0');
    });
  });
});
