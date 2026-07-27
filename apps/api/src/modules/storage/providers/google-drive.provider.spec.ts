import { ConflictException, ForbiddenException } from '@nestjs/common';
import { google } from 'googleapis';

import { GoogleAuthService } from '@/modules/google-auth/google-auth.service';
import { PrismaService } from '@/prisma/prisma.service';

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
  };
  let googleAuth: { getActiveAccountId: jest.Mock; getAuthorizedClient: jest.Mock };
  let prisma: {
    allowedFolder: { findMany: jest.Mock };
    uploadLog: { create: jest.Mock };
  };

  /**
   * Points `getAllowedFolderIds` at the given set of authorized root folder ids.
   **/
  const withAllowedRoots = (...folderIds: string[]) =>
    prisma.allowedFolder.findMany.mockResolvedValue(folderIds.map((folderId) => ({ folderId })));

  beforeEach(() => {
    files = { get: jest.fn(), list: jest.fn(), create: jest.fn(), delete: jest.fn() };
    (google.drive as jest.Mock).mockReturnValue({ files });

    googleAuth = {
      getActiveAccountId: jest.fn().mockResolvedValue('account-1'),
      getAuthorizedClient: jest
        .fn()
        .mockResolvedValue({ getAccessToken: jest.fn().mockResolvedValue({ token: 'access-token' }) }),
    };
    prisma = {
      allowedFolder: { findMany: jest.fn() },
      uploadLog: { create: jest.fn().mockResolvedValue(undefined) },
    };

    service = new GoogleDriveProvider(
      googleAuth as unknown as GoogleAuthService,
      prisma as unknown as PrismaService,
    );
  });

  describe('assertItemAllowed (via listContents)', () => {
    it('allows an authorized root folder directly, without walking ancestors', async () => {
      withAllowedRoots('root-1');
      files.list.mockResolvedValue({ data: { files: [] } });

      await expect(service.listContents('root-1')).resolves.toEqual([]);
      expect(files.get).not.toHaveBeenCalled();
    });

    it('allows an item whose ancestor is an authorized root', async () => {
      withAllowedRoots('root-1');
      files.get.mockResolvedValue({ data: { id: 'child', parents: ['root-1'] } });
      files.list.mockResolvedValue({ data: { files: [] } });

      await expect(service.listContents('child')).resolves.toEqual([]);
      expect(files.get).toHaveBeenCalledWith({ fileId: 'child', fields: 'id, parents' });
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

      const result = await service.listContents('root-1');

      expect(result[0]).toMatchObject({ id: 'f1', isFolder: true, size: null });
      expect(result[1]).toMatchObject({ id: 'f2', isFolder: false, size: 2048 });
      expect(result[2]).toMatchObject({ id: 'f3', isFolder: false, size: null });
      expect(result[3]).toMatchObject({ id: 'f4', name: '', mimeType: '', size: null });
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

      await expect(service.createFolder('orphan', 'New')).rejects.toBeInstanceOf(ForbiddenException);
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
      expect(prisma.uploadLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'SUCCESS', fileId: 'up-1' }) }),
      );
    });

    it('logs a FAILED entry and rethrows when the Drive upload fails', async () => {
      withAllowedRoots('root-1');
      files.create.mockRejectedValue(new Error('quota exceeded'));

      await expect(
        service.uploadFile('root-1', { body: {} as never, fileName: 'photo.jpg', mimeType: 'image/jpeg' }),
      ).rejects.toThrow('quota exceeded');

      expect(prisma.uploadLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'FAILED', error: 'quota exceeded' }),
        }),
      );
    });
  });
});
