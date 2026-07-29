import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { accessCookie, ownerCookie } from '../helpers/auth.helper';
import { encryptedTestRefreshToken } from '../helpers/fixtures.helper';
import { oauthClientMock, resetGoogleApisMock } from '../helpers/googleapis.mock';
import { createPrismaMock, PrismaMock, resetPrismaMock } from '../helpers/prisma.mock';
import { createTestApp } from '../helpers/test-app.helper';

jest.mock('googleapis', () => require('../helpers/googleapis.mock').createGoogleApisMock());

describe('Google Auth (integration)', () => {
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

  describe('Auth guard', () => {
    it('rejects a guarded route without an auth cookie (401 Unauthorized)', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/google-auth/status');

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ status: 401, message: 'Unauthorized' });
    });

    it('rejects a guarded route with an invalid access token', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/google-auth/status')
        .set('Cookie', 'accessToken=not-a-real-jwt');

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/google-auth/status', () => {
    it('reports a disconnected status when no account exists', async () => {
      prisma.driveAccount.findFirst.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .get('/api/v1/google-auth/status')
        .set('Cookie', accessCookie());

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ connected: false, email: null, allowedFolders: [] });
    });

    it('reports a connected status with email and folders', async () => {
      prisma.driveAccount.findFirst.mockResolvedValue({
        email: 'owner@gmail.com',
        allowedFolders: [{ id: 'f1', folderId: 'drive-1', name: 'Photos', createdAt: new Date() }],
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/google-auth/status')
        .set('Cookie', accessCookie());

      expect(res.status).toBe(200);
      expect(res.body.connected).toBe(true);
      expect(res.body.email).toBe('owner@gmail.com');
      expect(res.body.allowedFolders).toHaveLength(1);
    });
  });

  describe('POST /api/v1/google-auth/folders', () => {
    it('returns 403 without a verified owner cookie', async () => {
      prisma.driveAccount.findFirst.mockResolvedValue({ id: 'acc-1', email: 'owner@gmail.com' });

      const res = await request(app.getHttpServer())
        .post('/api/v1/google-auth/folders')
        .set('Cookie', accessCookie())
        .send({ folders: [{ folderId: 'drive-1', name: 'Photos' }] });

      expect(res.status).toBe(403);
    });

    it('returns 400 when the payload is invalid (empty folders)', async () => {
      prisma.driveAccount.findFirst.mockResolvedValue({ id: 'acc-1', email: 'owner@gmail.com' });

      const res = await request(app.getHttpServer())
        .post('/api/v1/google-auth/folders')
        .set('Cookie', `${accessCookie()}; ${ownerCookie('owner@gmail.com')}`)
        .send({ folders: [] });

      expect(res.status).toBe(400);
    });

    it('persists the selected folders and returns the updated list (201)', async () => {
      prisma.driveAccount.findFirst.mockResolvedValue({ id: 'acc-1', email: 'owner@gmail.com' });
      prisma.allowedFolder.findMany.mockResolvedValue([
        { id: 'f1', folderId: 'drive-1', name: 'Photos', createdAt: new Date() },
      ]);

      const res = await request(app.getHttpServer())
        .post('/api/v1/google-auth/folders')
        .set('Cookie', `${accessCookie()}; ${ownerCookie('owner@gmail.com')}`)
        .send({ folders: [{ folderId: 'drive-1', name: 'Photos' }] });

      expect(res.status).toBe(201);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].folderId).toBe('drive-1');
      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('GET /api/v1/google-auth/picker-token', () => {
    it('returns a short-lived access token for the Picker', async () => {
      prisma.driveAccount.findFirst.mockResolvedValue({ id: 'acc-1' });
      prisma.driveAccount.findUnique.mockResolvedValue({
        id: 'acc-1',
        refreshTokenEnc: encryptedTestRefreshToken,
      });
      oauthClientMock.getAccessToken.mockResolvedValue({ token: 'picker-access-token' });

      const res = await request(app.getHttpServer())
        .get('/api/v1/google-auth/picker-token')
        .set('Cookie', accessCookie());

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ accessToken: 'picker-access-token' });
    });
  });

  describe('DELETE /api/v1/google-auth/account', () => {
    it('returns 403 without a verified owner cookie', async () => {
      prisma.driveAccount.findFirst.mockResolvedValue({ id: 'acc-1', email: 'owner@gmail.com' });

      const res = await request(app.getHttpServer())
        .delete('/api/v1/google-auth/account')
        .set('Cookie', accessCookie());

      expect(res.status).toBe(403);
      expect(prisma.driveAccount.delete).not.toHaveBeenCalled();
    });

    it('disconnects the account and returns 204', async () => {
      prisma.driveAccount.findFirst.mockResolvedValue({ id: 'acc-1', email: 'owner@gmail.com' });
      prisma.driveAccount.findUnique.mockResolvedValue({
        id: 'acc-1',
        refreshTokenEnc: encryptedTestRefreshToken,
      });
      prisma.driveAccount.delete.mockResolvedValue({ id: 'acc-1' });

      const res = await request(app.getHttpServer())
        .delete('/api/v1/google-auth/account')
        .set('Cookie', `${accessCookie()}; ${ownerCookie('owner@gmail.com')}`);

      expect(res.status).toBe(204);
      expect(oauthClientMock.revokeCredentials).toHaveBeenCalled();
      expect(prisma.driveAccount.delete).toHaveBeenCalledWith({ where: { id: 'acc-1' } });
    });
  });
});
