import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { google } from 'googleapis';

import { GoogleAuthService } from '@/modules/google-auth/google-auth.service';
import { PrismaService } from '@/prisma/prisma.service';

import { StorageDisconnectedException } from '../storage.errors';
import { GoogleDriveProvider } from './google-drive.provider';

// Only the runtime `google.drive` factory is used; everything else is types.
jest.mock('googleapis', () => ({
  google: { drive: jest.fn() },
}));

const FOLDER_MIME = 'application/vnd.google-apps.folder';

describe('GoogleDriveProvider', () => {
  let service: GoogleDriveProvider;
  let files: {
    get: jest.Mock;
    list: jest.Mock;
    create: jest.Mock;
    delete: jest.Mock;
    update: jest.Mock;
  };
  let googleAuth: { getActiveAccountId: jest.Mock; getAuthorizedClient: jest.Mock };
  let prisma: {
    allowedFolder: { findMany: jest.Mock; deleteMany: jest.Mock };
  };

  /**
   * Points `getAllowedFolderIds` at the given set of authorized root folder ids.
   **/
  const withAllowedRoots = (...folderIds: string[]) =>
    prisma.allowedFolder.findMany.mockResolvedValue(folderIds.map((folderId) => ({ folderId })));

  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  beforeEach(() => {
    files = {
      get: jest.fn(),
      list: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
    };
    (google.drive as jest.Mock).mockReturnValue({ files });

    googleAuth = {
      getActiveAccountId: jest.fn().mockResolvedValue('account-1'),
      getAuthorizedClient: jest.fn().mockResolvedValue({
        getAccessToken: jest.fn().mockResolvedValue({ token: 'access-token' }),
      }),
    };
    prisma = {
      allowedFolder: { findMany: jest.fn(), deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };

    service = new GoogleDriveProvider(
      googleAuth as unknown as GoogleAuthService,
      prisma as unknown as PrismaService,
    );
  });

  describe('assertItemAllowed (via listContents)', () => {
    it('allows an authorized root folder without walking ancestors', async () => {
      withAllowedRoots('root-1');
      files.get.mockResolvedValue({ data: { id: 'root-1', parents: [] } });
      files.list.mockResolvedValue({ data: { files: [] } });

      await expect(service.listContents('root-1')).resolves.toEqual({
        entries: [],
        nextPageToken: null,
      });
      // Only the existence probe on the root itself — no ancestor lookups.
      expect(files.get).toHaveBeenCalledTimes(1);
      expect(files.get).toHaveBeenCalledWith({
        fileId: 'root-1',
        fields: 'id, parents, trashed',
      });
    });

    it('rejects an authorized root that was deleted in Drive (404)', async () => {
      withAllowedRoots('root-1');
      files.get.mockRejectedValue(Object.assign(new Error('File not found'), { code: 404 }));

      await expect(service.listContents('root-1')).rejects.toBeInstanceOf(NotFoundException);
      expect(files.list).not.toHaveBeenCalled();
    });

    it('rejects an item that is in the trash (404)', async () => {
      withAllowedRoots('root-1');
      files.get.mockResolvedValue({ data: { id: 'child', parents: ['root-1'], trashed: true } });

      await expect(service.listContents('child')).rejects.toBeInstanceOf(NotFoundException);
      expect(files.list).not.toHaveBeenCalled();
    });

    it('allows an item whose ancestor is an authorized root', async () => {
      withAllowedRoots('root-1');
      files.get.mockResolvedValue({ data: { id: 'child', parents: ['root-1'] } });
      files.list.mockResolvedValue({ data: { files: [] } });

      await expect(service.listContents('child')).resolves.toEqual({
        entries: [],
        nextPageToken: null,
      });
      expect(files.get).toHaveBeenCalledWith({ fileId: 'child', fields: 'id, parents, trashed' });
    });

    it('rejects an item whose ancestry never reaches an authorized root', async () => {
      withAllowedRoots('root-1');
      files.get.mockResolvedValue({ data: { id: 'orphan', parents: [] } });

      await expect(service.listContents('orphan')).rejects.toBeInstanceOf(ForbiddenException);
      expect(files.list).not.toHaveBeenCalled();
    });

    it('rejects an item the app cannot see (files.get throws)', async () => {
      withAllowedRoots('root-1');
      files.get.mockRejectedValue(new Error('404 Not Found'));

      await expect(service.listContents('hidden')).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('listContents (mapping)', () => {
    it('maps folders and files, normalizing size', async () => {
      withAllowedRoots('root-1');
      files.list.mockResolvedValue({
        data: {
          files: [
            { id: 'f1', name: 'Sub', mimeType: FOLDER_MIME, size: '999' },
            { id: 'f2', name: 'doc.pdf', mimeType: 'application/pdf', size: '2048' },
            { id: 'f3', name: 'weird', mimeType: 'application/pdf', size: 'not-a-number' },
            { id: 'f4' },
          ],
        },
      });

      const { entries, nextPageToken } = await service.listContents('root-1');

      expect(entries[0]).toMatchObject({ id: 'f1', isFolder: true, size: null });
      expect(entries[1]).toMatchObject({ id: 'f2', isFolder: false, size: 2048 });
      expect(entries[2]).toMatchObject({ id: 'f3', isFolder: false, size: null });
      expect(entries[3]).toMatchObject({ id: 'f4', name: '', mimeType: '', size: null });
      expect(nextPageToken).toBeNull();
    });

    it('returns the cursor for the next page', async () => {
      withAllowedRoots('root-1');
      files.list.mockResolvedValue({ data: { files: [], nextPageToken: 'CURSOR' } });

      const { nextPageToken } = await service.listContents('root-1');

      expect(nextPageToken).toBe('CURSOR');
    });

    it('adds an escaped name filter to the query when searching', async () => {
      withAllowedRoots('root-1');
      files.list.mockResolvedValue({ data: { files: [] } });

      await service.listContents('root-1', { search: "a'b" });

      expect(files.list).toHaveBeenCalledWith(
        expect.objectContaining({ q: expect.stringContaining("name contains 'a\\'b'") }),
      );
    });
  });

  describe('deleteItem', () => {
    it('refuses to delete an authorized root folder (409)', async () => {
      withAllowedRoots('root-1');

      await expect(service.deleteItem('root-1')).rejects.toBeInstanceOf(ConflictException);
      expect(files.delete).not.toHaveBeenCalled();
    });

    it('deletes an item that lives inside the authorized tree', async () => {
      withAllowedRoots('root-1');
      files.get.mockResolvedValue({ data: { id: 'child', parents: ['root-1'] } });
      files.delete.mockResolvedValue({});

      await service.deleteItem('child');

      expect(files.delete).toHaveBeenCalledWith({ fileId: 'child' });
    });

    it('refuses to delete an item outside the authorized tree', async () => {
      withAllowedRoots('root-1');
      files.get.mockResolvedValue({ data: { id: 'x', parents: [] } });

      await expect(service.deleteItem('x')).rejects.toBeInstanceOf(ForbiddenException);
      expect(files.delete).not.toHaveBeenCalled();
    });
  });

  describe('createFolder', () => {
    it('creates a subfolder inside an authorized folder and maps the result', async () => {
      withAllowedRoots('root-1');
      files.create.mockResolvedValue({
        data: { id: 'new-1', name: 'New', mimeType: FOLDER_MIME },
      });

      const result = await service.createFolder('root-1', 'New');

      expect(files.create).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: { name: 'New', mimeType: FOLDER_MIME, parents: ['root-1'] },
        }),
      );
      expect(result).toMatchObject({ id: 'new-1', name: 'New', isFolder: true, size: null });
    });

    it('refuses to create a folder outside the authorized tree', async () => {
      withAllowedRoots('root-1');
      files.get.mockResolvedValue({ data: { parents: [] } });

      await expect(service.createFolder('orphan', 'New')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(files.create).not.toHaveBeenCalled();
    });
  });

  describe('uploadFile', () => {
    it('records a successful upload in the log and returns the result', async () => {
      withAllowedRoots('root-1');
      files.create.mockResolvedValue({
        data: { id: 'up-1', name: 'photo.jpg', size: '1024', webViewLink: 'http://view' },
      });

      const result = await service.uploadFile('root-1', {
        body: {} as never,
        fileName: 'photo.jpg',
        mimeType: 'image/jpeg',
      });

      expect(result).toEqual({
        fileId: 'up-1',
        fileName: 'photo.jpg',
        size: 1024,
        webViewLink: 'http://view',
      });
    });

    it('rethrows when the Drive upload fails', async () => {
      withAllowedRoots('root-1');
      files.create.mockRejectedValue(new Error('quota exceeded'));

      await expect(
        service.uploadFile('root-1', {
          body: {} as never,
          fileName: 'photo.jpg',
          mimeType: 'image/jpeg',
        }),
      ).rejects.toThrow('quota exceeded');
    });
  });

  describe('resolveNames', () => {
    it('resolves each authorized id to its name + Drive link', async () => {
      withAllowedRoots('a', 'b');
      files.get.mockImplementation(({ fileId, fields }: { fileId: string; fields: string }) =>
        Promise.resolve(
          fields === 'id, parents, trashed'
            ? { data: { id: fileId, parents: [] } }
            : {
                data: { id: fileId, name: `name-${fileId}`, webViewLink: `http://view/${fileId}` },
              },
        ),
      );

      await expect(service.resolveNames(['a', 'b'])).resolves.toEqual([
        { id: 'a', name: 'name-a', webViewLink: 'http://view/a' },
        { id: 'b', name: 'name-b', webViewLink: 'http://view/b' },
      ]);
      expect(files.get).toHaveBeenCalledWith({ fileId: 'a', fields: 'id, name, webViewLink' });
    });

    it('falls back to an empty name / null link for ids the app cannot see', async () => {
      withAllowedRoots('ok');
      files.get.mockImplementation(({ fileId, fields }: { fileId: string; fields: string }) => {
        if (fields === 'id, parents, trashed') {
          return Promise.resolve({ data: { id: fileId, parents: [] } });
        }
        return fileId === 'ok'
          ? Promise.resolve({ data: { id: 'ok', name: 'Visible', webViewLink: 'http://view' } })
          : Promise.reject(new Error('404 Not Found'));
      });

      await expect(service.resolveNames(['ok', 'hidden'])).resolves.toEqual([
        { id: 'ok', name: 'Visible', webViewLink: 'http://view' },
        { id: 'hidden', name: '', webViewLink: null },
      ]);
    });

    it('does not leak the name of a file outside the authorized tree', async () => {
      withAllowedRoots('root-1');
      // The id resolves in Drive (the grant covers the whole account) but hangs off another tree.
      files.get.mockImplementation(({ fileId, fields }: { fileId: string; fields: string }) =>
        Promise.resolve(
          fields === 'id, parents, trashed'
            ? { data: { id: fileId, parents: ['somewhere-else'] } }
            : { data: { id: fileId, name: 'Tax return 2025.pdf', webViewLink: 'http://view' } },
        ),
      );

      await expect(service.resolveNames(['outsider'])).resolves.toEqual([
        { id: 'outsider', name: '', webViewLink: null },
      ]);
    });
  });

  describe('createFolderArchive', () => {
    it('refuses to ZIP an authorized root folder (400)', async () => {
      withAllowedRoots('root-1');

      await expect(service.createFolderArchive('root-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(files.get).not.toHaveBeenCalled();
    });

    it('refuses to ZIP a non-folder item (400)', async () => {
      withAllowedRoots('root-1');
      files.get.mockResolvedValue({
        data: { id: 'doc', name: 'doc.pdf', mimeType: 'application/pdf', parents: ['root-1'] },
      });

      await expect(service.createFolderArchive('doc')).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('listRoots (liveness pruning)', () => {
    const row = { id: 'f1', folderId: 'drive-1', name: 'Photos', createdAt: new Date() };
    // The rows are mapped to the wire entity on the way out, which serializes `createdAt`.
    const entity = { ...row, createdAt: row.createdAt.toISOString() };

    /**
     * Scripts the authorized-root rows independently of `getAllowedFolderIds`.
     **/
    const withRootRows = () => {
      prisma.allowedFolder.findMany.mockResolvedValue([row]);
    };

    it('returns a root that still exists in Drive', async () => {
      withRootRows();
      files.get.mockResolvedValue({ data: { id: 'drive-1', trashed: false } });

      await expect(service.listRoots()).resolves.toEqual([entity]);
      expect(prisma.allowedFolder.deleteMany).not.toHaveBeenCalled();
    });

    it('hides a trashed root but keeps the authorization (it can be restored in Drive)', async () => {
      withRootRows();
      files.get.mockResolvedValue({ data: { id: 'drive-1', trashed: true } });

      await expect(service.listRoots()).resolves.toEqual([]);
      expect(prisma.allowedFolder.deleteMany).not.toHaveBeenCalled();
    });

    it('drops and unauthorizes a root Drive reports as gone (404)', async () => {
      withRootRows();
      files.get.mockRejectedValue(Object.assign(new Error('File not found'), { code: 404 }));

      await expect(service.listRoots()).resolves.toEqual([]);
      expect(prisma.allowedFolder.deleteMany).toHaveBeenCalledWith({
        where: { driveAccountId: 'account-1', id: { in: ['f1'] } },
      });
    });

    it('keeps a root when the liveness check fails transiently', async () => {
      withRootRows();
      // Only a hard 404 is proof; treating a 500 as proof would revoke a working authorization.
      files.get.mockRejectedValue(Object.assign(new Error('backend error'), { code: 500 }));

      await expect(service.listRoots()).resolves.toEqual([entity]);
      expect(prisma.allowedFolder.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('renameItem', () => {
    it('renames an item inside the authorized tree', async () => {
      withAllowedRoots('root-1');
      files.get.mockResolvedValue({ data: { id: 'doc', parents: ['root-1'] } });
      files.update.mockResolvedValue({
        data: { id: 'doc', name: 'new.pdf', mimeType: 'application/pdf', size: '10' },
      });

      await expect(service.renameItem('doc', 'new.pdf')).resolves.toMatchObject({
        id: 'doc',
        name: 'new.pdf',
        isFolder: false,
        size: 10,
      });
      expect(files.update).toHaveBeenCalledWith(
        expect.objectContaining({ fileId: 'doc', requestBody: { name: 'new.pdf' } }),
      );
    });

    it('refuses to rename an authorized root (409)', async () => {
      withAllowedRoots('root-1');

      await expect(service.renameItem('root-1', 'Renamed')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(files.update).not.toHaveBeenCalled();
    });

    it('refuses to rename an item outside the authorized tree (403)', async () => {
      withAllowedRoots('root-1');
      files.get.mockResolvedValue({ data: { id: 'outsider', parents: [] } });

      await expect(service.renameItem('outsider', 'new')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(files.update).not.toHaveBeenCalled();
    });
  });

  describe('moveItem', () => {
    it('reparents an item, detaching it from its previous parents', async () => {
      withAllowedRoots('root-1');
      files.get.mockImplementation(({ fileId }: { fileId: string }) =>
        Promise.resolve({ data: { id: fileId, parents: ['root-1'] } }),
      );
      files.update.mockResolvedValue({
        data: { id: 'doc', name: 'doc.pdf', mimeType: 'application/pdf' },
      });

      await expect(service.moveItem('doc', 'sub-1')).resolves.toMatchObject({ id: 'doc' });
      expect(files.update).toHaveBeenCalledWith(
        expect.objectContaining({
          fileId: 'doc',
          addParents: 'sub-1',
          removeParents: 'root-1',
        }),
      );
    });

    it('rejects moving an item into itself (400)', async () => {
      withAllowedRoots('root-1');

      await expect(service.moveItem('doc', 'doc')).rejects.toBeInstanceOf(BadRequestException);
      expect(files.update).not.toHaveBeenCalled();
    });

    it('refuses to move an authorized root (409)', async () => {
      withAllowedRoots('root-1');

      await expect(service.moveItem('root-1', 'sub-1')).rejects.toBeInstanceOf(ConflictException);
      expect(files.update).not.toHaveBeenCalled();
    });

    it('validates the destination too, not just the item (403)', async () => {
      withAllowedRoots('root-1');
      // Checking only the source would let an operator move an authorized file out into the rest of the Drive.
      files.get.mockImplementation(({ fileId }: { fileId: string }) =>
        Promise.resolve({
          data: { id: fileId, parents: fileId === 'doc' ? ['root-1'] : [] },
        }),
      );

      await expect(service.moveItem('doc', 'elsewhere')).rejects.toBeInstanceOf(ForbiddenException);
      expect(files.update).not.toHaveBeenCalled();
    });
  });

  describe('downloadFile', () => {
    it('returns the stream with the file metadata', async () => {
      withAllowedRoots('root-1');
      const stream = { pipe: jest.fn() };
      files.get.mockImplementation(({ alt, fields }: { alt?: string; fields?: string }) => {
        if (alt === 'media') return Promise.resolve({ data: stream });
        if (fields === 'name, mimeType, size') {
          return Promise.resolve({
            data: { name: 'doc.pdf', mimeType: 'application/pdf', size: '2048' },
          });
        }
        return Promise.resolve({ data: { id: 'doc', parents: ['root-1'] } });
      });

      await expect(service.downloadFile('doc')).resolves.toMatchObject({
        stream,
        name: 'doc.pdf',
        mimeType: 'application/pdf',
        size: 2048,
      });
    });

    it('refuses to stream a folder as a file (400)', async () => {
      withAllowedRoots('root-1');
      files.get.mockImplementation(({ fields }: { fields?: string }) =>
        Promise.resolve(
          fields === 'name, mimeType, size'
            ? { data: { name: 'Sub', mimeType: FOLDER_MIME } }
            : { data: { id: 'sub', parents: ['root-1'] } },
        ),
      );

      await expect(service.downloadFile('sub')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses a file outside the authorized tree (403)', async () => {
      withAllowedRoots('root-1');
      files.get.mockResolvedValue({ data: { id: 'outsider', parents: [] } });

      await expect(service.downloadFile('outsider')).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  // The only paths reaching Google over raw `fetch`; test/setup-env.ts makes an unstubbed call throw.
  describe('createResumableUpload', () => {
    const init = {
      name: 'big.bin',
      mimeType: 'application/octet-stream',
      size: 1024,
      origin: 'http://localhost:3000',
    };
    let fetchMock: jest.Mock;

    beforeEach(() => {
      fetchMock = jest.fn();
      global.fetch = fetchMock as unknown as typeof fetch;
    });

    it('returns the session URL Google puts in the Location header', async () => {
      withAllowedRoots('root-1');
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({
          location: 'https://www.googleapis.com/upload/drive/v3/files?upload_id=X',
        }),
      });

      await expect(service.createResumableUpload('root-1', init)).resolves.toEqual({
        uploadUrl: 'https://www.googleapis.com/upload/drive/v3/files?upload_id=X',
      });
    });

    it('bakes the validated parent and the browser origin into the session', async () => {
      withAllowedRoots('root-1');
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ location: 'https://www.googleapis.com/upload/drive/session' }),
      });

      await service.createResumableUpload('root-1', init);

      const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
      // The parent is server-side only: the browser gets a session it cannot repoint elsewhere.
      expect(JSON.parse(options.body as string)).toEqual({
        name: 'big.bin',
        parents: ['root-1'],
        mimeType: 'application/octet-stream',
      });
      expect((options.headers as Record<string, string>)['Origin']).toBe('http://localhost:3000');
    });

    it('refuses to open a session for a folder outside the authorized tree (403)', async () => {
      withAllowedRoots('root-1');
      files.get.mockResolvedValue({ data: { id: 'outsider', parents: [] } });

      await expect(service.createResumableUpload('outsider', init)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('maps a rejected session to a 503', async () => {
      withAllowedRoots('root-1');
      fetchMock.mockResolvedValue({ ok: false, status: 403, headers: new Headers() });

      await expect(service.createResumableUpload('root-1', init)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it('maps a 200 without a Location header to a 503', async () => {
      withAllowedRoots('root-1');
      fetchMock.mockResolvedValue({ ok: true, status: 200, headers: new Headers() });

      await expect(service.createResumableUpload('root-1', init)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });

  describe('getUploadStatus', () => {
    let fetchMock: jest.Mock;

    beforeEach(() => {
      fetchMock = jest.fn();
      global.fetch = fetchMock as unknown as typeof fetch;
    });

    // The URL is request-supplied, so this prefix check is all that stops an SSRF into the internal network.
    it.each([
      ['an unrelated host', 'https://evil.example.com/upload/drive/v3/files'],
      ['plain http', 'http://www.googleapis.com/upload/drive/v3/files'],
      ['an internal address', 'http://169.254.169.254/latest/meta-data/'],
      ['a look-alike host', 'https://www.googleapis.com.evil.test/upload/drive/'],
      [
        'the prefix buried in a query string',
        'https://evil.test/?u=https://www.googleapis.com/upload/drive/',
      ],
    ])('rejects %s without dialling it (400)', async (_label, url) => {
      await expect(service.getUploadStatus(url, 100)).rejects.toBeInstanceOf(BadRequestException);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('reports a finished session with the created file id', async () => {
      fetchMock.mockResolvedValue({
        status: 200,
        headers: new Headers(),
        json: jest.fn().mockResolvedValue({ id: 'file-1' }),
      });

      await expect(
        service.getUploadStatus(
          'https://www.googleapis.com/upload/drive/v3/files?upload_id=X',
          500,
        ),
      ).resolves.toEqual({ complete: true, receivedBytes: 500, fileId: 'file-1' });
    });

    it('survives a 200 whose body is not JSON', async () => {
      fetchMock.mockResolvedValue({
        status: 201,
        headers: new Headers(),
        json: jest.fn().mockRejectedValue(new Error('not json')),
      });

      await expect(
        service.getUploadStatus('https://www.googleapis.com/upload/drive/v3/files', 500),
      ).resolves.toEqual({ complete: true, receivedBytes: 500, fileId: null });
    });

    it('translates a 308 Range header into the received byte count', async () => {
      // "bytes=0-99" means bytes 0..99 inclusive landed, i.e. 100 bytes.
      fetchMock.mockResolvedValue({
        status: 308,
        headers: new Headers({ range: 'bytes=0-99' }),
      });

      await expect(
        service.getUploadStatus('https://www.googleapis.com/upload/drive/v3/files', 500),
      ).resolves.toEqual({ complete: false, receivedBytes: 100, fileId: null });
    });

    it('treats a 308 without a Range header as nothing received', async () => {
      fetchMock.mockResolvedValue({ status: 308, headers: new Headers() });

      await expect(
        service.getUploadStatus('https://www.googleapis.com/upload/drive/v3/files', 500),
      ).resolves.toEqual({ complete: false, receivedBytes: 0, fileId: null });
    });

    it('falls back to 0 when the Range header is unparseable', async () => {
      fetchMock.mockResolvedValue({
        status: 308,
        headers: new Headers({ range: 'bytes=garbage' }),
      });

      await expect(
        service.getUploadStatus('https://www.googleapis.com/upload/drive/v3/files', 500),
      ).resolves.toMatchObject({ receivedBytes: 0 });
    });

    it('maps any other status to a 503', async () => {
      fetchMock.mockResolvedValue({ status: 500, headers: new Headers() });

      await expect(
        service.getUploadStatus('https://www.googleapis.com/upload/drive/v3/files', 500),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });

  describe('getDrive (token refresh guard)', () => {
    it('maps an invalid_grant (revoked token) to a 424 StorageDisconnectedException', async () => {
      googleAuth.getAuthorizedClient.mockResolvedValue({
        getAccessToken: jest.fn().mockRejectedValue({ message: 'invalid_grant' }),
      });

      await expect(service.resolveNames(['a'])).rejects.toBeInstanceOf(
        StorageDisconnectedException,
      );
    });

    it('maps a transient network error to a clean 503 without leaking the token', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn');
      googleAuth.getAuthorizedClient.mockResolvedValue({
        getAccessToken: jest.fn().mockRejectedValue(new Error('ETIMEDOUT connecting to oauth2')),
      });

      await expect(service.resolveNames(['a'])).rejects.toBeInstanceOf(ServiceUnavailableException);
      // Only the error message is logged — never the raw gaxios error carrying the refresh token.
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('token refresh failed'));
    });
  });
});
