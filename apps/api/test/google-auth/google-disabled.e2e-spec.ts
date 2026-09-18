import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { accessCookie } from '../helpers/auth.helper';
import { resetGoogleApisMock } from '../helpers/googleapis.mock';
import { createPrismaMock, PrismaMock, resetPrismaMock } from '../helpers/prisma.mock';
import { createTestApp } from '../helpers/test-app.helper';

jest.mock('googleapis', () => require('../helpers/googleapis.mock').createGoogleApisMock());

/**
 * The `GOOGLE_ENABLED=false` kill-switch: with Drive off, nothing of it is reachable or listed.
 **/
// Its own app instance — the env is read once, when the config factories run at boot.
describe('Google Drive disabled (integration)', () => {
  let app: INestApplication;
  const prisma: PrismaMock = createPrismaMock();
  const savedEnabled = process.env.GOOGLE_ENABLED;

  beforeAll(async () => {
    process.env.GOOGLE_ENABLED = 'false';
    app = await createTestApp(prisma);
  });

  afterAll(async () => {
    await app.close();
    if (savedEnabled === undefined) delete process.env.GOOGLE_ENABLED;
    else process.env.GOOGLE_ENABLED = savedEnabled;
  });

  beforeEach(() => {
    resetPrismaMock(prisma);
    resetGoogleApisMock();
  });

  it('lists no backend at all (S3 is disabled in the test env too)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/storage/status')
      .set('Cookie', accessCookie());

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('404s every /storage/drive route', async () => {
    const paths = [
      '/api/v1/storage/drive/folders',
      '/api/v1/storage/drive/folders/root-1/contents',
      '/api/v1/storage/drive/names?ids=root-1',
      '/api/v1/storage/drive/files/file-1/download',
    ];

    const statuses: [string, number][] = [];

    // Sequential on purpose: supertest opens its own listener per request, and firing them at the
    // same in-process app in parallel races into an ECONNRESET.
    for (const path of paths) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app.getHttpServer()).get(path).set('Cookie', accessCookie());

      statuses.push([path, res.status]);
    }

    expect(statuses).toEqual(paths.map((path) => [path, 404]));
  });

  it('404s the authenticated google-auth routes', async () => {
    const status = await request(app.getHttpServer())
      .get('/api/v1/google-auth/status')
      .set('Cookie', accessCookie());
    const pickerToken = await request(app.getHttpServer())
      .get('/api/v1/google-auth/picker-token')
      .set('Cookie', accessCookie());

    expect(status.status).toBe(404);
    expect(pickerToken.status).toBe(404);
  });

  it('404s the public OAuth legs instead of starting a consent flow', async () => {
    const redirect = await request(app.getHttpServer())
      .get('/api/v1/google-auth/google')
      .set('Cookie', accessCookie())
      .redirects(0);
    const callback = await request(app.getHttpServer())
      .get('/api/v1/google-auth/google/callback?code=abc&state=xyz')
      .redirects(0);

    expect(redirect.status).toBe(404);
    expect(callback.status).toBe(404);
    // No consent redirect, and no Set-Cookie state nonce.
    expect(redirect.headers.location).toBeUndefined();
  });

  it('never touches the database for a disabled backend', async () => {
    await request(app.getHttpServer()).get('/api/v1/storage/status').set('Cookie', accessCookie());

    expect(prisma.driveAccount.findFirst).not.toHaveBeenCalled();
  });
});
