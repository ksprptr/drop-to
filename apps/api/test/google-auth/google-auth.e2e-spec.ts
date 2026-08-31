import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { accessCookie } from '../helpers/auth.helper';
import { oauthClientMock, resetGoogleApisMock } from '../helpers/googleapis.mock';
import { createPrismaMock, PrismaMock, resetPrismaMock } from '../helpers/prisma.mock';
import { createTestApp } from '../helpers/test-app.helper';

jest.mock('googleapis', () => require('../helpers/googleapis.mock').createGoogleApisMock());

/**
 * Guards the OAuth consent flow: operator-only initiation and cookie-bound `state` nonce.
 **/
describe('Google Auth OAuth flow (integration)', () => {
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
    resetGoogleApisMock();
  });

  describe('GET /api/v1/google-auth/google (initiation)', () => {
    it('rejects an unauthenticated caller (401) — only the operator may bind an account', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/google-auth/google').redirects(0);

      expect(res.status).toBe(401);
    });

    it('for the operator, redirects to consent and sets an httpOnly state cookie', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/google-auth/google')
        .set('Cookie', accessCookie())
        .redirects(0);

      expect(res.status).toBe(302);
      expect(res.headers['location']).toBe('https://consent');
      // A state nonce is minted and persisted in an httpOnly cookie for the callback to verify.
      const setCookie = String(res.headers['set-cookie']);
      expect(setCookie).toContain('oauthState=');
      expect(setCookie).toContain('HttpOnly');
      // The same nonce is forwarded to Google's consent URL.
      expect(oauthClientMock.generateAuthUrl).toHaveBeenCalledWith(
        expect.objectContaining({ state: expect.any(String) }),
      );
    });
  });

  describe('GET /api/v1/google-auth/google/callback', () => {
    it('rejects a callback with no state cookie (redirects with invalid_state, no DB write)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/google-auth/google/callback')
        .query({ code: 'attacker-code', state: 'forged' })
        .redirects(0);

      expect(res.status).toBe(302);
      expect(res.headers['location']).toContain('error=invalid_state');
      expect(prisma.driveAccount.upsert).not.toHaveBeenCalled();
    });

    it('rejects a callback whose state does not match the cookie', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/google-auth/google/callback')
        .query({ code: 'attacker-code', state: 'aaaa' })
        .set('Cookie', 'oauthState=bbbb')
        .redirects(0);

      expect(res.status).toBe(302);
      expect(res.headers['location']).toContain('error=invalid_state');
      expect(prisma.driveAccount.upsert).not.toHaveBeenCalled();
    });

    it('accepts a callback whose state matches the cookie and binds the account', async () => {
      oauthClientMock.getToken.mockResolvedValue({
        tokens: { refresh_token: 'rt', id_token: null },
      });
      prisma.driveAccount.upsert.mockResolvedValue({ id: 'acc-1', email: 'owner@example.com' });

      const res = await request(app.getHttpServer())
        .get('/api/v1/google-auth/google/callback')
        .query({ code: 'valid-code', state: 'match' })
        .set('Cookie', 'oauthState=match')
        .redirects(0);

      expect(res.status).toBe(302);
      expect(res.headers['location']).toContain('connected=1');
      expect(prisma.driveAccount.upsert).toHaveBeenCalled();
    });
  });
});
