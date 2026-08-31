import { INestApplication } from '@nestjs/common';
import { Readable } from 'node:stream';
import request from 'supertest';

import { accessCookie } from '../helpers/auth.helper';
import { encryptedTestRefreshToken } from '../helpers/fixtures.helper';
import { driveFilesMock, resetGoogleApisMock } from '../helpers/googleapis.mock';
import { createPrismaMock, PrismaMock, resetPrismaMock } from '../helpers/prisma.mock';
import { createTestApp } from '../helpers/test-app.helper';

jest.mock('googleapis', () => require('../helpers/googleapis.mock').createGoogleApisMock());

const FOLDER_MIME = 'application/vnd.google-apps.folder';

// Read from the environment: .env.test.example keeps this deliberately small so the size-limit
// path is reachable, but a local .env.test that drifted must not turn into a false failure.
const MAX_UPLOAD_BYTES = Number(process.env['MAX_UPLOAD_BYTES']);

describe('Drive (integration)', () => {
  let app: INestApplication;
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
  });

  describe('GET /api/v1/storage/drive/folders', () => {
    it('rejects a request without an auth cookie (401)', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/storage/drive/folders');

      expect(res.status).toBe(401);
    });

    it('returns the authorized root folders for the active account', async () => {
      connectAccountWithRoots();
      prisma.allowedFolder.findMany.mockResolvedValue([
        { id: 'f1', folderId: 'drive-1', name: 'Photos', createdAt: new Date() },
      ]);
      driveFilesMock.get.mockResolvedValue({ data: { id: 'drive-1' } });

      const res = await request(app.getHttpServer())
        .get('/api/v1/storage/drive/folders')
        .set('Cookie', accessCookie());

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].folderId).toBe('drive-1');
    });

    it('drops (and unauthorizes) a root folder that was deleted in Drive', async () => {
      connectAccountWithRoots();
      prisma.allowedFolder.findMany.mockResolvedValue([
        { id: 'f1', folderId: 'drive-1', name: 'Photos', createdAt: new Date() },
      ]);
      driveFilesMock.get.mockRejectedValue(
        Object.assign(new Error('File not found'), { code: 404 }),
      );

      const res = await request(app.getHttpServer())
        .get('/api/v1/storage/drive/folders')
        .set('Cookie', accessCookie());

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
      expect(prisma.allowedFolder.deleteMany).toHaveBeenCalledWith({
        where: { driveAccountId: 'acc-1', id: { in: ['f1'] } },
      });
    });

    it('returns 404 when no Google account is connected', async () => {
      prisma.driveAccount.findFirst.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .get('/api/v1/storage/drive/folders')
        .set('Cookie', accessCookie());

      expect(res.status).toBe(404);
      expect(res.body.status).toBe(404);
    });
  });

  describe('GET /api/v1/storage/drive/names', () => {
    it('returns an empty array (and never touches the provider) when no ids are given', async () => {
      prisma.driveAccount.findFirst.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .get('/api/v1/storage/drive/names')
        .set('Cookie', accessCookie());

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('resolves the display name + Drive link for each requested id', async () => {
      connectAccountWithRoots('root-1');
      // "a" and "b" sit inside the authorized root; the walk runs before the metadata read.
      driveFilesMock.get.mockImplementation(
        ({ fileId, fields }: { fileId: string; fields: string }) =>
          Promise.resolve(
            fields === 'id, parents, trashed'
              ? { data: { id: fileId, parents: ['root-1'], trashed: false } }
              : {
                  data: {
                    id: fileId,
                    name: `folder-${fileId}`,
                    webViewLink: `http://view/${fileId}`,
                  },
                },
          ),
      );

      const res = await request(app.getHttpServer())
        .get('/api/v1/storage/drive/names')
        .query({ ids: ' a , b ,' })
        .set('Cookie', accessCookie());

      expect(res.status).toBe(200);
      expect(res.body).toEqual([
        { id: 'a', name: 'folder-a', webViewLink: 'http://view/a' },
        { id: 'b', name: 'folder-b', webViewLink: 'http://view/b' },
      ]);
    });

    it('returns an empty placeholder for an id outside the authorized tree', async () => {
      connectAccountWithRoots('root-1');
      // Parented somewhere else in the owner's Drive: reachable by the OAuth grant, not by the app.
      driveFilesMock.get.mockImplementation(
        ({ fileId, fields }: { fileId: string; fields: string }) =>
          Promise.resolve(
            fields === 'id, parents, trashed'
              ? { data: { id: fileId, parents: ['someone-elses-folder'], trashed: false } }
              : { data: { id: fileId, name: 'Tax return.pdf', webViewLink: 'http://view/secret' } },
          ),
      );

      const res = await request(app.getHttpServer())
        .get('/api/v1/storage/drive/names')
        .query({ ids: 'outsider' })
        .set('Cookie', accessCookie());

      expect(res.status).toBe(200);
      expect(res.body).toEqual([{ id: 'outsider', name: '', webViewLink: null }]);
    });

    it('rejects more ids than the per-request cap (400)', async () => {
      connectAccountWithRoots('root-1');

      const res = await request(app.getHttpServer())
        .get('/api/v1/storage/drive/names')
        .query({ ids: Array.from({ length: 51 }, (_, i) => `id-${i}`).join(',') })
        .set('Cookie', accessCookie());

      expect(res.status).toBe(400);
      expect(driveFilesMock.get).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/v1/storage/drive/folders/:id/contents', () => {
    it('lists a folder inside the authorized tree', async () => {
      connectAccountWithRoots('root-1');
      driveFilesMock.list.mockResolvedValue({
        data: {
          files: [
            { id: 'sub', name: 'Sub', mimeType: FOLDER_MIME },
            { id: 'doc', name: 'doc.pdf', mimeType: 'application/pdf', size: '2048' },
          ],
        },
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/storage/drive/folders/root-1/contents')
        .set('Cookie', accessCookie());

      expect(res.status).toBe(200);
      expect(res.body.entries).toHaveLength(2);
      expect(res.body.entries[0]).toMatchObject({ id: 'sub', isFolder: true });
      expect(res.body.nextPageToken).toBeNull();
    });

    it('refuses a folder outside the authorized tree (403)', async () => {
      connectAccountWithRoots('root-1');
      // Reachable by the OAuth grant (it covers the whole Drive) but not parented under a root.
      driveFilesMock.get.mockResolvedValue({ data: { id: 'outsider', parents: [] } });

      const res = await request(app.getHttpServer())
        .get('/api/v1/storage/drive/folders/outsider/contents')
        .set('Cookie', accessCookie());

      expect(res.status).toBe(403);
      expect(driveFilesMock.list).not.toHaveBeenCalled();
    });

    it('normalizes unknown sort parameters instead of passing them through', async () => {
      connectAccountWithRoots('root-1');
      driveFilesMock.list.mockResolvedValue({ data: { files: [] } });

      const res = await request(app.getHttpServer())
        .get('/api/v1/storage/drive/folders/root-1/contents')
        .query({ sort: 'sqli', dir: 'sideways' })
        .set('Cookie', accessCookie());

      expect(res.status).toBe(200);
      // Falls back to the name/asc default; the raw value never reaches the Drive query.
      expect(driveFilesMock.list).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: expect.stringContaining('name') }),
      );
      expect(JSON.stringify(driveFilesMock.list.mock.calls)).not.toContain('sqli');
    });

    it('rejects a request without an auth cookie (401)', async () => {
      const res = await request(app.getHttpServer()).get(
        '/api/v1/storage/drive/folders/root-1/contents',
      );

      expect(res.status).toBe(401);
    });
  });

  describe('PATCH /api/v1/storage/drive/files/:id/rename', () => {
    it('renames an item inside the authorized tree', async () => {
      connectAccountWithRoots('root-1');
      driveFilesMock.get.mockResolvedValue({ data: { id: 'doc', parents: ['root-1'] } });
      driveFilesMock.update.mockResolvedValue({
        data: { id: 'doc', name: 'renamed.pdf', mimeType: 'application/pdf' },
      });

      const res = await request(app.getHttpServer())
        .patch('/api/v1/storage/drive/files/doc/rename')
        .set('Cookie', accessCookie())
        .send({ name: 'renamed.pdf' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: 'doc', name: 'renamed.pdf' });
    });

    it('rejects a name containing a path separator (400)', async () => {
      connectAccountWithRoots('root-1');

      const res = await request(app.getHttpServer())
        .patch('/api/v1/storage/drive/files/doc/rename')
        .set('Cookie', accessCookie())
        .send({ name: '../escaped.pdf' });

      expect(res.status).toBe(400);
      expect(driveFilesMock.update).not.toHaveBeenCalled();
    });

    it('rejects an empty name (400)', async () => {
      connectAccountWithRoots('root-1');

      const res = await request(app.getHttpServer())
        .patch('/api/v1/storage/drive/files/doc/rename')
        .set('Cookie', accessCookie())
        .send({ name: '' });

      expect(res.status).toBe(400);
    });

    it('strips unknown properties rather than forwarding them (400)', async () => {
      connectAccountWithRoots('root-1');

      const res = await request(app.getHttpServer())
        .patch('/api/v1/storage/drive/files/doc/rename')
        .set('Cookie', accessCookie())
        .send({ name: 'ok.pdf', fileId: 'somebody-elses-file' });

      // forbidNonWhitelisted: an unexpected field is a 400, not a silently ignored one.
      expect(res.status).toBe(400);
    });

    it('refuses to rename an authorized root (409)', async () => {
      connectAccountWithRoots('root-1');

      const res = await request(app.getHttpServer())
        .patch('/api/v1/storage/drive/files/root-1/rename')
        .set('Cookie', accessCookie())
        .send({ name: 'Renamed root' });

      expect(res.status).toBe(409);
      expect(driveFilesMock.update).not.toHaveBeenCalled();
    });
  });

  describe('PATCH /api/v1/storage/drive/files/:id/move', () => {
    it('moves an item between authorized folders', async () => {
      connectAccountWithRoots('root-1');
      driveFilesMock.get.mockImplementation(({ fileId }: { fileId: string }) =>
        Promise.resolve({ data: { id: fileId, parents: ['root-1'] } }),
      );
      driveFilesMock.update.mockResolvedValue({
        data: { id: 'doc', name: 'doc.pdf', mimeType: 'application/pdf' },
      });

      const res = await request(app.getHttpServer())
        .patch('/api/v1/storage/drive/files/doc/move')
        .set('Cookie', accessCookie())
        .send({ targetFolderId: 'sub-1' });

      expect(res.status).toBe(200);
      expect(driveFilesMock.update).toHaveBeenCalledWith(
        expect.objectContaining({ addParents: 'sub-1', removeParents: 'root-1' }),
      );
    });

    it('rejects moving an item into itself (400)', async () => {
      connectAccountWithRoots('root-1');

      const res = await request(app.getHttpServer())
        .patch('/api/v1/storage/drive/files/doc/move')
        .set('Cookie', accessCookie())
        .send({ targetFolderId: 'doc' });

      expect(res.status).toBe(400);
    });

    it('refuses a destination outside the authorized tree (403)', async () => {
      connectAccountWithRoots('root-1');
      driveFilesMock.get.mockImplementation(({ fileId }: { fileId: string }) =>
        Promise.resolve({ data: { id: fileId, parents: fileId === 'doc' ? ['root-1'] : [] } }),
      );

      const res = await request(app.getHttpServer())
        .patch('/api/v1/storage/drive/files/doc/move')
        .set('Cookie', accessCookie())
        .send({ targetFolderId: 'elsewhere' });

      expect(res.status).toBe(403);
      expect(driveFilesMock.update).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/v1/storage/drive/files/:id/download', () => {
    /**
     * Scripts an authorized file whose media request yields the given body.
     **/
    const withDownloadableFile = (name: string, body: string) => {
      connectAccountWithRoots('root-1');
      driveFilesMock.get.mockImplementation(
        ({ alt, fields }: { alt?: string; fields?: string }) => {
          if (alt === 'media') return Promise.resolve({ data: Readable.from([body]) });
          if (fields === 'name, mimeType, size') {
            return Promise.resolve({
              data: { name, mimeType: 'text/plain', size: String(body.length) },
            });
          }
          return Promise.resolve({ data: { id: 'doc', parents: ['root-1'] } });
        },
      );
    };

    it('streams the file with its length and disposition', async () => {
      withDownloadableFile('note.txt', 'hello');

      const res = await request(app.getHttpServer())
        .get('/api/v1/storage/drive/files/doc/download')
        .set('Cookie', accessCookie());

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/plain');
      expect(res.headers['content-length']).toBe('5');
      expect(res.headers['content-disposition']).toBe(
        'attachment; filename="note.txt"; filename*=UTF-8\'\'note.txt',
      );
    });

    it('escapes a non-ASCII filename into an ASCII fallback plus an RFC 5987 variant', async () => {
      withDownloadableFile('účtenka "2026".txt', 'x');

      const res = await request(app.getHttpServer())
        .get('/api/v1/storage/drive/files/doc/download')
        .set('Cookie', accessCookie());

      const disposition = res.headers['content-disposition'] as string;
      // The quoted fallback must stay ASCII and must not contain a quote that ends it early.
      expect(disposition).toContain('filename="__tenka 2026.txt"');
      expect(disposition).toContain("filename*=UTF-8''%C3%BA%C4%8Dtenka");
    });

    it('refuses a file outside the authorized tree (403)', async () => {
      connectAccountWithRoots('root-1');
      driveFilesMock.get.mockResolvedValue({ data: { id: 'outsider', parents: [] } });

      const res = await request(app.getHttpServer())
        .get('/api/v1/storage/drive/files/outsider/download')
        .set('Cookie', accessCookie());

      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/v1/storage/drive/folders/:id/download', () => {
    it('streams an authorized subfolder as a ZIP with a filename', async () => {
      connectAccountWithRoots('root-1');
      driveFilesMock.get.mockImplementation(({ fields }: { fields?: string }) =>
        Promise.resolve(
          fields === 'name, mimeType'
            ? { data: { name: 'Sub', mimeType: FOLDER_MIME } }
            : { data: { id: 'sub', parents: ['root-1'] } },
        ),
      );
      driveFilesMock.list.mockResolvedValue({ data: { files: [] } });

      const res = await request(app.getHttpServer())
        .get('/api/v1/storage/drive/folders/sub/download')
        .set('Cookie', accessCookie())
        .buffer()
        .parse((response, callback) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () => callback(null, Buffer.concat(chunks)));
        });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/zip');
      expect(res.headers['content-disposition']).toContain('filename="Sub.zip"');
      // "PK" — a real archive came back, not an empty body with ZIP headers bolted on.
      expect((res.body as Buffer).subarray(0, 2).toString()).toBe('PK');
    });

    it('refuses to ZIP an authorized root (400)', async () => {
      connectAccountWithRoots('root-1');

      const res = await request(app.getHttpServer())
        .get('/api/v1/storage/drive/folders/root-1/download')
        .set('Cookie', accessCookie());

      expect(res.status).toBe(400);
    });

    it('refuses a folder outside the authorized tree (403)', async () => {
      connectAccountWithRoots('root-1');
      driveFilesMock.get.mockResolvedValue({ data: { id: 'outsider', parents: [] } });

      const res = await request(app.getHttpServer())
        .get('/api/v1/storage/drive/folders/outsider/download')
        .set('Cookie', accessCookie());

      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/v1/storage/drive/folders/:id/subfolder', () => {
    it('creates a subfolder inside an authorized folder (201)', async () => {
      connectAccountWithRoots('root-1');
      driveFilesMock.create.mockResolvedValue({
        data: { id: 'new-1', name: 'New folder', mimeType: FOLDER_MIME },
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/storage/drive/folders/root-1/subfolder')
        .set('Cookie', accessCookie())
        .send({ name: 'New folder' });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        id: 'new-1',
        name: 'New folder',
        isFolder: true,
        size: null,
      });
      expect(driveFilesMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: { name: 'New folder', mimeType: FOLDER_MIME, parents: ['root-1'] },
        }),
      );
    });

    it('rejects a folder name containing a slash (400)', async () => {
      connectAccountWithRoots('root-1');

      const res = await request(app.getHttpServer())
        .post('/api/v1/storage/drive/folders/root-1/subfolder')
        .set('Cookie', accessCookie())
        .send({ name: 'bad/name' });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/v1/storage/drive/folders/:id/upload', () => {
    it('uploads a file into an authorized folder (201)', async () => {
      connectAccountWithRoots('root-1');
      driveFilesMock.create.mockResolvedValue({
        data: { id: 'up-1', name: 'note.txt', size: '5', webViewLink: 'http://view/up-1' },
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/storage/drive/folders/root-1/upload')
        .set('Cookie', accessCookie())
        .attach('file', Buffer.from('hello'), 'note.txt');

      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        fileId: 'up-1',
        fileName: 'note.txt',
        size: 5,
        webViewLink: 'http://view/up-1',
      });
    });

    it('returns 400 when no file is attached', async () => {
      connectAccountWithRoots('root-1');

      const res = await request(app.getHttpServer())
        .post('/api/v1/storage/drive/folders/root-1/upload')
        .set('Cookie', accessCookie());

      expect(res.status).toBe(400);
    });

    it('rejects a file over MAX_UPLOAD_BYTES (400)', async () => {
      connectAccountWithRoots('root-1');
      // Drain like a real upload would (otherwise backpressure stalls the request), but never
      // settle: the 400 has to come from busboy's own limit, not from whatever the upstream answers.
      driveFilesMock.create.mockImplementation(({ media }: { media?: { body?: Readable } }) => {
        media?.body?.resume();

        return new Promise(() => {});
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/storage/drive/folders/root-1/upload')
        .set('Cookie', accessCookie())
        .attach('file', Buffer.alloc(MAX_UPLOAD_BYTES + 1024, 'x'), 'huge.bin');

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/v1/storage/drive/files/:id', () => {
    it('returns 409 when trying to delete an authorized root folder', async () => {
      connectAccountWithRoots('root-1');

      const res = await request(app.getHttpServer())
        .delete('/api/v1/storage/drive/files/root-1')
        .set('Cookie', accessCookie());

      expect(res.status).toBe(409);
      expect(res.body.message).toBe('Authorized root folders cannot be deleted.');
      expect(driveFilesMock.delete).not.toHaveBeenCalled();
    });

    it('returns 403 when the item is outside the authorized tree', async () => {
      connectAccountWithRoots('root-1');
      driveFilesMock.get.mockResolvedValue({ data: { id: 'orphan', parents: [] } });

      const res = await request(app.getHttpServer())
        .delete('/api/v1/storage/drive/files/orphan')
        .set('Cookie', accessCookie());

      expect(res.status).toBe(403);
      expect(driveFilesMock.delete).not.toHaveBeenCalled();
    });

    it('deletes an item that lives inside the authorized tree (204)', async () => {
      connectAccountWithRoots('root-1');
      driveFilesMock.get.mockResolvedValue({ data: { id: 'child', parents: ['root-1'] } });
      driveFilesMock.delete.mockResolvedValue({});

      const res = await request(app.getHttpServer())
        .delete('/api/v1/storage/drive/files/child')
        .set('Cookie', accessCookie());

      expect(res.status).toBe(204);
      expect(driveFilesMock.delete).toHaveBeenCalledWith({ fileId: 'child' });
    });
  });
});
