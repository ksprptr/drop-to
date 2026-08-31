import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { accessCookie } from '../helpers/auth.helper';
import { encryptedTestRefreshToken } from '../helpers/fixtures.helper';
import { driveFilesMock, resetGoogleApisMock } from '../helpers/googleapis.mock';
import { createPrismaMock, PrismaMock, resetPrismaMock } from '../helpers/prisma.mock';
import { createTestApp } from '../helpers/test-app.helper';

jest.mock('googleapis', () => require('../helpers/googleapis.mock').createGoogleApisMock());

// Read from the environment rather than hardcoded: both are configurable, and a local .env.test
// that drifts from .env.test.example must not turn into a false failure here.
const MAX_UPLOAD_BYTES = Number(process.env['MAX_UPLOAD_BYTES']);
const OFFLINE_TIMEOUT_MS = Number(process.env['OFFLINE_TIMEOUT_MS']);

/**
 * The resumable flow: the browser streams straight to Google, so the API only opens the session,
 * answers "how far did it get" and validates the finished file.
 **/
// These three routes are the only ones that reach Google over raw `fetch` instead of the mocked
// `google.drive()` client, so `global.fetch` is stubbed here. test/setup-env.ts turns an unstubbed
// call into a loud failure, which is what guarantees this suite never dials googleapis.com.
describe('Resumable upload (integration)', () => {
  let app: INestApplication;
  let fetchMock: jest.Mock;
  const prisma: PrismaMock = createPrismaMock();

  /**
   * Scripts a connected account with the given authorized root folder ids.
   **/
  const connectAccountWithRoots = (...folderIds: string[]) => {
    prisma.driveAccount.findFirst.mockResolvedValue({ id: 'acc-1' });
    prisma.driveAccount.findUnique.mockResolvedValue({
      id: 'acc-1',
      refreshTokenEnc: encryptedTestRefreshToken,
    });
    prisma.allowedFolder.findMany.mockResolvedValue(folderIds.map((folderId) => ({ folderId })));
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
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  describe('POST /api/v1/storage/drive/folders/:id/upload-session', () => {
    it('opens a session and hands back the URL plus the server-set offline timeout', async () => {
      connectAccountWithRoots('root-1');
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({
          location: 'https://www.googleapis.com/upload/drive/v3/files?upload_id=X',
        }),
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/storage/drive/folders/root-1/upload-session')
        .set('Cookie', accessCookie())
        .send({ name: 'big.bin', mimeType: 'application/octet-stream', size: 1024 });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        uploadUrl: 'https://www.googleapis.com/upload/drive/v3/files?upload_id=X',
        offlineTimeoutMs: OFFLINE_TIMEOUT_MS,
      });
    });

    it('refuses a file over the configured maximum (400)', async () => {
      connectAccountWithRoots('root-1');

      const res = await request(app.getHttpServer())
        .post('/api/v1/storage/drive/folders/root-1/upload-session')
        .set('Cookie', accessCookie())
        .send({
          name: 'huge.bin',
          mimeType: 'application/octet-stream',
          size: MAX_UPLOAD_BYTES + 1,
        });

      expect(res.status).toBe(400);
      // Rejected before a session is opened at Google.
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('refuses a folder outside the authorized tree (403)', async () => {
      connectAccountWithRoots('root-1');
      driveFilesMock.get.mockResolvedValue({ data: { id: 'outsider', parents: [] } });

      const res = await request(app.getHttpServer())
        .post('/api/v1/storage/drive/folders/outsider/upload-session')
        .set('Cookie', accessCookie())
        .send({ name: 'big.bin', mimeType: 'application/octet-stream', size: 1024 });

      expect(res.status).toBe(403);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each([
      ['a missing name', { mimeType: 'text/plain', size: 10 }],
      ['a zero size', { name: 'a.txt', mimeType: 'text/plain', size: 0 }],
      ['a non-integer size', { name: 'a.txt', mimeType: 'text/plain', size: 1.5 }],
      ['an unknown field', { name: 'a.txt', mimeType: 'text/plain', size: 10, parents: ['x'] }],
    ])('rejects %s (400)', async (_label, body) => {
      connectAccountWithRoots('root-1');

      const res = await request(app.getHttpServer())
        .post('/api/v1/storage/drive/folders/root-1/upload-session')
        .set('Cookie', accessCookie())
        .send(body);

      expect(res.status).toBe(400);
    });

    it('rejects a request without an auth cookie (401)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/storage/drive/folders/root-1/upload-session')
        .send({ name: 'big.bin', mimeType: 'application/octet-stream', size: 1024 });

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/v1/storage/drive/upload-status', () => {
    it('reports how many bytes a session has received', async () => {
      connectAccountWithRoots('root-1');
      fetchMock.mockResolvedValue({ status: 308, headers: new Headers({ range: 'bytes=0-99' }) });

      const res = await request(app.getHttpServer())
        .post('/api/v1/storage/drive/upload-status')
        .set('Cookie', accessCookie())
        .send({
          uploadUrl: 'https://www.googleapis.com/upload/drive/v3/files?upload_id=X',
          size: 500,
        });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ complete: false, receivedBytes: 100, fileId: null });
    });

    it('reports a finished session with the resulting file id', async () => {
      connectAccountWithRoots('root-1');
      fetchMock.mockResolvedValue({
        status: 200,
        headers: new Headers(),
        json: jest.fn().mockResolvedValue({ id: 'file-1' }),
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/storage/drive/upload-status')
        .set('Cookie', accessCookie())
        .send({
          uploadUrl: 'https://www.googleapis.com/upload/drive/v3/files?upload_id=X',
          size: 500,
        });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ complete: true, receivedBytes: 500, fileId: 'file-1' });
    });

    // The URL is request-supplied, so this endpoint would be a server-side request forgery
    // primitive into the internal network if the host check were ever relaxed.
    it.each([
      ['an unrelated host', 'https://evil.example.com/upload/drive/v3/files'],
      ['plain http', 'http://www.googleapis.com/upload/drive/v3/files'],
      ['a cloud metadata address', 'http://169.254.169.254/latest/meta-data/'],
      ['a look-alike host', 'https://www.googleapis.com.evil.test/upload/drive/'],
      ['a loopback address', 'http://127.0.0.1:6379/'],
    ])('refuses to dial %s (400)', async (_label, uploadUrl) => {
      connectAccountWithRoots('root-1');

      const res = await request(app.getHttpServer())
        .post('/api/v1/storage/drive/upload-status')
        .set('Cookie', accessCookie())
        .send({ uploadUrl, size: 500 });

      expect(res.status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects a request without an auth cookie (401)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/storage/drive/upload-status')
        .send({ uploadUrl: 'https://www.googleapis.com/upload/drive/v3/files', size: 500 });

      expect(res.status).toBe(401);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/v1/storage/drive/files/:id/finalize', () => {
    it('validates the browser-uploaded file and returns the stored entry', async () => {
      connectAccountWithRoots('root-1');
      driveFilesMock.get.mockImplementation(({ fields }: { fields?: string }) =>
        Promise.resolve(
          fields === 'id, parents, trashed'
            ? { data: { id: 'file-1', parents: ['root-1'], trashed: false } }
            : {
                data: {
                  id: 'file-1',
                  name: 'big.bin',
                  size: '1024',
                  parents: ['root-1'],
                  webViewLink: 'http://view/file-1',
                },
              },
        ),
      );

      const res = await request(app.getHttpServer())
        .post('/api/v1/storage/drive/files/file-1/finalize')
        .set('Cookie', accessCookie());

      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        fileId: 'file-1',
        fileName: 'big.bin',
        size: 1024,
        webViewLink: 'http://view/file-1',
      });
    });

    // The browser completes the upload itself, so finalize is where a file that ended up outside
    // the authorized tree has to be caught.
    it('refuses to finalize a file outside the authorized tree (403)', async () => {
      connectAccountWithRoots('root-1');
      driveFilesMock.get.mockResolvedValue({ data: { id: 'file-1', parents: ['elsewhere'] } });

      const res = await request(app.getHttpServer())
        .post('/api/v1/storage/drive/files/file-1/finalize')
        .set('Cookie', accessCookie());

      expect(res.status).toBe(403);
    });
  });
});
