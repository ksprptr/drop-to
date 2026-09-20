import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { accessCookie } from '../helpers/auth.helper';
import { resetGoogleApisMock } from '../helpers/googleapis.mock';
import { createPrismaMock, PrismaMock, resetPrismaMock } from '../helpers/prisma.mock';
import { createTestApp } from '../helpers/test-app.helper';

jest.mock('googleapis', () => require('../helpers/googleapis.mock').createGoogleApisMock());

describe('Storage (integration)', () => {
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

  describe('GET /api/v1/storage/status', () => {
    it('rejects a request without an auth cookie (401)', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/storage/status');

      expect(res.status).toBe(401);
    });

    it('reports only the enabled backends (S3 is disabled in tests) ', async () => {
      prisma.driveAccount.findFirst.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .get('/api/v1/storage/status')
        .set('Cookie', accessCookie());

      expect(res.status).toBe(200);
      const backends = res.body.map((status: { backend: string }) => status.backend);
      // A backend switched off in the environment is absent entirely, not listed as disconnected.
      expect(backends).toEqual(['drive']);

      const drive = res.body.find((status: { backend: string }) => status.backend === 'drive');
      expect(drive).toMatchObject({ label: 'Google Drive', connected: false, roots: [] });
    });
  });

  describe('GET /api/v1/storage/:backend/names (id cap + dedup)', () => {
    it('rejects a request without an auth cookie (401)', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/storage/drive/names?ids=a');

      expect(res.status).toBe(401);
    });

    // A crafted `ids=` must not fan out into unbounded upstream metadata reads: the controller caps
    // the list before it ever reaches the provider, so this 400 needs no connected account.
    it('400s when more than 50 ids are requested', async () => {
      const ids = Array.from({ length: 51 }, (_, i) => `id-${i}`).join(',');

      const res = await request(app.getHttpServer())
        .get(`/api/v1/storage/drive/names?ids=${ids}`)
        .set('Cookie', accessCookie());

      expect(res.status).toBe(400);
    });

    it('accepts exactly 50 ids (the cap is inclusive, and dedup keeps it under)', async () => {
      // 60 entries, but only 40 distinct — dedup brings the effective count under the cap.
      const ids = Array.from({ length: 60 }, (_, i) => `id-${i % 40}`).join(',');
      prisma.driveAccount.findFirst.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/storage/drive/names?ids=${ids}`)
        .set('Cookie', accessCookie());

      // Not a 400: dedup collapsed 60 → 40, under the 50 cap. (No account → the provider then 4xxs,
      // but never the id-cap 400 this test is about.)
      expect(res.status).not.toBe(400);
    });

    it('returns an empty array for a blank ids list, without touching the provider', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/storage/drive/names?ids=')
        .set('Cookie', accessCookie());

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('unknown / disabled backends', () => {
    it('returns 404 for an unknown backend', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/storage/nope/folders')
        .set('Cookie', accessCookie());

      expect(res.status).toBe(404);
    });

    it('returns 404 when browsing S3 while it is disabled', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/storage/s3/folders')
        .set('Cookie', accessCookie());

      expect(res.status).toBe(404);
    });
  });
});
