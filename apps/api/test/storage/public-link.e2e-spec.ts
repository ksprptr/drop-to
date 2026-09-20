import { INestApplication } from '@nestjs/common';
import { Readable } from 'node:stream';
import request from 'supertest';

import { accessCookie } from '../helpers/auth.helper';
import { encryptedTestRefreshToken } from '../helpers/fixtures.helper';
import { driveFilesMock, resetGoogleApisMock } from '../helpers/googleapis.mock';
import { createPrismaMock, PrismaMock, resetPrismaMock } from '../helpers/prisma.mock';
import { createTestApp } from '../helpers/test-app.helper';

jest.mock('googleapis', () => require('../helpers/googleapis.mock').createGoogleApisMock());

// From the environment, like the rest of the suite: a drifted .env.test must not fake a pass.
const WEB_APP_URL = process.env['WEB_APP_URL'];

describe('Public links (integration)', () => {
  let app: INestApplication;
  const prisma: PrismaMock = createPrismaMock();

  /**
   * Scripts a connected Drive account whose authorized root contains `doc`.
   **/
  const connectAccount = () => {
    prisma.driveAccount.findFirst.mockResolvedValue({ id: 'acc-1' });
    prisma.driveAccount.findUnique.mockResolvedValue({
      id: 'acc-1',
      refreshTokenEnc: encryptedTestRefreshToken,
    });
    prisma.allowedFolder.findMany.mockResolvedValue([{ folderId: 'root-1' }]);
  };

  /**
   * Scripts an authorized, downloadable file with the given name, type and body.
   **/
  const withFile = (name: string, mimeType: string, body: string) => {
    connectAccount();
    driveFilesMock.get.mockImplementation(({ alt, fields }: { alt?: string; fields?: string }) => {
      if (alt === 'media') return Promise.resolve({ data: Readable.from([body]) });
      if (fields === 'name, mimeType, size') {
        return Promise.resolve({ data: { name, mimeType, size: String(body.length) } });
      }
      return Promise.resolve({ data: { id: 'doc', name, parents: ['root-1'] } });
    });
  };

  /**
   * Scripts a stored link row that `GET /public/:token` will resolve.
   **/
  const withStoredLink = (overrides: Record<string, unknown> = {}) => {
    prisma.publicLink.findUnique.mockResolvedValue({
      token: 'tok-1',
      backend: 'drive',
      itemId: 'doc',
      fileName: 'photo.png',
      createdAt: new Date(),
      ...overrides,
    });
  };

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

  describe('POST /api/v1/storage/:backend/files/:id/public-link', () => {
    it('rejects a request without an auth cookie (401)', async () => {
      const res = await request(app.getHttpServer()).post(
        '/api/v1/storage/drive/files/doc/public-link',
      );

      expect(res.status).toBe(401);
    });

    it('creates a link whose URL points at the web app and keeps the file extension', async () => {
      withFile('photo.png', 'image/png', 'x');
      prisma.publicLink.upsert.mockImplementation(
        ({ create }: { create: Record<string, unknown> }) =>
          Promise.resolve({ ...create, createdAt: new Date() }),
      );

      const res = await request(app.getHttpServer())
        .post('/api/v1/storage/drive/files/doc/public-link')
        .set('Cookie', accessCookie())
        .send({});

      expect(res.status).toBe(201);
      expect(res.body.url).toBe(`${WEB_APP_URL}/f/${res.body.token}/photo.png`);
    });

    it('404s for an item outside the authorized tree', async () => {
      connectAccount();
      // Ancestor walk never reaches an authorized root → the provider reports an empty name.
      driveFilesMock.get.mockResolvedValue({ data: { id: 'outsider', parents: [] } });

      const res = await request(app.getHttpServer())
        .post('/api/v1/storage/drive/files/outsider/public-link')
        .set('Cookie', accessCookie())
        .send({});

      expect(res.status).toBe(404);
      expect(prisma.publicLink.upsert).not.toHaveBeenCalled();
    });

    it('404s for a backend switched off in the environment (S3 in tests)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/storage/s3/files/whatever/public-link')
        .set('Cookie', accessCookie())
        .send({});

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/v1/storage/:backend/files/:id/public-link', () => {
    it('rejects a request without an auth cookie (401)', async () => {
      const res = await request(app.getHttpServer()).delete(
        '/api/v1/storage/drive/files/doc/public-link',
      );

      expect(res.status).toBe(401);
    });

    it('revokes the link (204)', async () => {
      connectAccount();

      const res = await request(app.getHttpServer())
        .delete('/api/v1/storage/drive/files/doc/public-link')
        .set('Cookie', accessCookie());

      expect(res.status).toBe(204);
      expect(prisma.publicLink.deleteMany).toHaveBeenCalledWith({
        where: { backend: 'drive', itemId: 'doc' },
      });
    });
  });

  describe('GET /api/v1/public/:token', () => {
    it('streams the file to a caller with no session at all', async () => {
      withStoredLink();
      withFile('photo.png', 'image/png', 'bytes');

      const res = await request(app.getHttpServer()).get('/api/v1/public/tok-1');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('image/png');
      expect(res.headers['content-disposition']).toContain('inline');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });

    // The bytes are proxied, never handed off via a redirect to a signed storage URL: such a URL
    // is a standalone credential that would outlive revocation. Together with `no-store` this is
    // what makes "stop sharing" take effect on the very next request.
    it('streams the bytes itself rather than redirecting to storage', async () => {
      withStoredLink();
      withFile('photo.png', 'image/png', 'bytes');

      const res = await request(app.getHttpServer()).get('/api/v1/public/tok-1');

      expect(res.status).toBe(200);
      expect(res.headers['location']).toBeUndefined();
      expect(res.headers['cache-control']).toBe('no-store');
    });

    // Rendering either of these inline would be stored XSS on the app's own origin.
    it('forces a download for a scriptable type instead of rendering it', async () => {
      withStoredLink({ fileName: 'page.html' });
      withFile('page.html', 'text/html', '<script>alert(1)</script>');

      const res = await request(app.getHttpServer()).get('/api/v1/public/tok-1');

      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toContain('attachment');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });

    it('404s an unknown token', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/public/nope');

      expect(res.status).toBe(404);
    });

    // Revocation deletes the row, so the very next request is already dead.
    it('404s a token whose row has been revoked', async () => {
      prisma.publicLink.findUnique.mockResolvedValue(null);

      const res = await request(app.getHttpServer()).get('/api/v1/public/tok-1');

      expect(res.status).toBe(404);
    });

    it('404s a token whose backend has since been switched off', async () => {
      withStoredLink({ backend: 's3' });

      const res = await request(app.getHttpServer()).get('/api/v1/public/tok-1');

      expect(res.status).toBe(404);
    });

    it('403s a token pointing outside the authorized tree, even though the row exists', async () => {
      withStoredLink({ itemId: 'outsider' });
      connectAccount();
      driveFilesMock.get.mockResolvedValue({ data: { id: 'outsider', parents: [] } });

      const res = await request(app.getHttpServer()).get('/api/v1/public/tok-1');

      expect(res.status).toBe(403);
    });
  });

  describe('folder listings', () => {
    it('reports the public URL of a file that has one, and null for the rest', async () => {
      connectAccount();
      driveFilesMock.list.mockResolvedValue({
        data: {
          files: [
            { id: 'shared', name: 'photo.png', mimeType: 'image/png', size: '1' },
            { id: 'private', name: 'other.png', mimeType: 'image/png', size: '1' },
          ],
          nextPageToken: null,
        },
      });
      driveFilesMock.get.mockResolvedValue({ data: { id: 'root-1', parents: [] } });
      prisma.publicLink.findMany.mockResolvedValue([
        { itemId: 'shared', token: 'tok-1', fileName: 'photo.png' },
      ]);

      const res = await request(app.getHttpServer())
        .get('/api/v1/storage/drive/folders/root-1/contents')
        .set('Cookie', accessCookie());

      expect(res.status).toBe(200);
      const byId = Object.fromEntries(
        (res.body.entries as { id: string; publicUrl: string | null }[]).map((entry) => [
          entry.id,
          entry.publicUrl,
        ]),
      );
      expect(byId.shared).toBe(`${WEB_APP_URL}/f/tok-1/photo.png`);
      expect(byId.private).toBeNull();
    });
  });
});
