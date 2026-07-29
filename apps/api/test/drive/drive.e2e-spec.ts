import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { accessCookie } from '../helpers/auth.helper';
import { encryptedTestRefreshToken } from '../helpers/fixtures.helper';
import { driveFilesMock, resetGoogleApisMock } from '../helpers/googleapis.mock';
import { createPrismaMock, PrismaMock, resetPrismaMock } from '../helpers/prisma.mock';
import { createTestApp } from '../helpers/test-app.helper';

jest.mock('googleapis', () => require('../helpers/googleapis.mock').createGoogleApisMock());

const FOLDER_MIME = 'application/vnd.google-apps.folder';

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
      prisma.driveAccount.findFirst.mockResolvedValue({ id: 'acc-1' });
      prisma.allowedFolder.findMany.mockResolvedValue([
        { id: 'f1', folderId: 'drive-1', name: 'Photos', createdAt: new Date() },
      ]);

      const res = await request(app.getHttpServer())
        .get('/api/v1/storage/drive/folders')
        .set('Cookie', accessCookie());

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].folderId).toBe('drive-1');
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

    it('resolves the display name for each requested id', async () => {
      connectAccountWithRoots('root-1');
      driveFilesMock.get.mockImplementation(({ fileId }: { fileId: string }) =>
        Promise.resolve({ data: { id: fileId, name: `folder-${fileId}` } }),
      );

      const res = await request(app.getHttpServer())
        .get('/api/v1/storage/drive/names')
        .query({ ids: ' a , b ,' })
        .set('Cookie', accessCookie());

      expect(res.status).toBe(200);
      expect(res.body).toEqual([
        { id: 'a', name: 'folder-a' },
        { id: 'b', name: 'folder-b' },
      ]);
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
      expect(prisma.uploadLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'SUCCESS' }) }),
      );
    });

    it('returns 400 when no file is attached', async () => {
      connectAccountWithRoots('root-1');

      const res = await request(app.getHttpServer())
        .post('/api/v1/storage/drive/folders/root-1/upload')
        .set('Cookie', accessCookie());

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
