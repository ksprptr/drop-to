import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { createPrismaMock, PrismaMock, resetPrismaMock } from './helpers/prisma.mock';
import { createTestApp } from './helpers/test-app.helper';

jest.mock('googleapis', () => require('./helpers/googleapis.mock').createGoogleApisMock());

// CORS_ALLOWED_ORIGINS in .env.test.
const ALLOWED_ORIGIN = 'http://localhost:3000';

/**
 * The cross-cutting HTTP setup itself: prefix, security headers and the CORS allowlist.
 **/
// From `configureApp`; the harness used to re-declare these and omit helmet/CORS, so nothing covered them.
describe('App setup (integration)', () => {
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

  describe('global prefix', () => {
    it('serves the API under /api/v1', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/auth/me');

      // 401, not 404: the route exists and the guard answered.
      expect(res.status).toBe(401);
    });

    it('exempts the health probe from the prefix', async () => {
      const res = await request(app.getHttpServer()).get('/health');

      expect(res.status).not.toBe(404);
    });

    it('404s a route outside the prefix', async () => {
      const res = await request(app.getHttpServer()).get('/auth/me');

      expect(res.status).toBe(404);
    });
  });

  describe('security headers (helmet)', () => {
    it('sets nosniff and denies framing', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/auth/me');

      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    });

    it('does not advertise the framework', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/auth/me');

      expect(res.headers['x-powered-by']).toBeUndefined();
    });

    it('leaves CSP unset (JSON API, and a default policy breaks dev Swagger UI)', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/auth/me');

      expect(res.headers['content-security-policy']).toBeUndefined();
    });
  });

  describe('CORS allowlist', () => {
    it('allows the configured web app origin with credentials', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Origin', ALLOWED_ORIGIN);

      expect(res.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
      // Auth rides in cookies, so the browser only sends them when this is true.
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });

    it('refuses to echo an origin that is not on the allowlist', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Origin', 'https://evil.example.com');

      // No header at all — the browser then blocks the response from reaching the page.
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('never answers with a wildcard, which credentials would make unusable anyway', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Origin', ALLOWED_ORIGIN);

      expect(res.headers['access-control-allow-origin']).not.toBe('*');
    });

    it('answers a preflight for an allowed origin', async () => {
      const res = await request(app.getHttpServer())
        .options('/api/v1/auth/login')
        .set('Origin', ALLOWED_ORIGIN)
        .set('Access-Control-Request-Method', 'POST');

      expect(res.status).toBeLessThan(300);
      expect(res.headers['access-control-allow-methods']).toContain('POST');
    });
  });
});
