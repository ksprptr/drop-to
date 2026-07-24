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

    it('reports every backend; S3 is disabled and Drive is not connected in tests', async () => {
      prisma.driveAccount.findFirst.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .get('/api/v1/storage/status')
        .set('Cookie', accessCookie());

      expect(res.status).toBe(200);
      const backends = res.body.map((status: { backend: string }) => status.backend);
      expect(backends).toEqual(['drive', 's3']);

      const drive = res.body.find((status: { backend: string }) => status.backend === 'drive');
      const s3 = res.body.find((status: { backend: string }) => status.backend === 's3');
      expect(drive).toMatchObject({ label: 'Google Drive', connected: false, roots: [] });
      expect(s3).toMatchObject({ label: 'S3 Storage', connected: false, roots: [] });
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
