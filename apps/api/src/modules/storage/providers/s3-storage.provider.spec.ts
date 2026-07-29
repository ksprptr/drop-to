import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import type { S3Config } from '@/config/s3.config';
import type { PrismaService } from '@/prisma/prisma.service';

import { S3_UNAVAILABLE_MESSAGE, StorageDisconnectedException } from '../storage.errors';
import { S3StorageProvider } from './s3-storage.provider';

// Every AWS command is mocked to a `{ cmd, input }` tag so `send` calls are inspectable.
jest.mock('@aws-sdk/client-s3', () => {
  const tag = (name: string) =>
    jest.fn().mockImplementation((input: unknown) => ({ cmd: name, input }));

  return {
    S3Client: jest.fn(),
    ListObjectsV2Command: tag('list'),
    PutObjectCommand: tag('put'),
    DeleteObjectCommand: tag('delete'),
    DeleteObjectsCommand: tag('deleteMany'),
    CopyObjectCommand: tag('copy'),
    GetObjectCommand: tag('get'),
    HeadObjectCommand: tag('head'),
  };
});

jest.mock('@aws-sdk/lib-storage', () => ({ Upload: jest.fn() }));

const BUCKET = 'bucket-1';
const idOf = (bucket: string, key: string) =>
  Buffer.from(JSON.stringify([bucket, key])).toString('base64url');

const baseCfg: S3Config = {
  enabled: true,
  buckets: [BUCKET],
  region: 'eu',
  accessKeyId: 'k',
  secretAccessKey: 's',
  endpoint: undefined,
  forcePathStyle: false,
};

describe('S3StorageProvider', () => {
  let send: jest.Mock;
  let uploadDone: jest.Mock;
  let prisma: { uploadLog: { create: jest.Mock } };

  const make = (override: Partial<S3Config> = {}) =>
    new S3StorageProvider({ ...baseCfg, ...override }, prisma as unknown as PrismaService);

  const sentCmds = () =>
    send.mock.calls.map((call) => call[0] as { cmd: string; input: Record<string, unknown> });

  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  beforeEach(() => {
    send = jest.fn().mockResolvedValue({});
    (S3Client as unknown as jest.Mock).mockImplementation(() => ({ send }));
    uploadDone = jest.fn().mockResolvedValue({});
    (Upload as unknown as jest.Mock).mockImplementation(() => ({
      done: uploadDone,
      abort: jest.fn(),
    }));
    prisma = { uploadLog: { create: jest.fn().mockResolvedValue(undefined) } };
  });

  describe('guards (resolve / ensureEnabled)', () => {
    it('rejects any browse op when S3 is disabled (404)', async () => {
      // listRoots guards synchronously; listContents guards inside its async body.
      expect(() => make({ enabled: false }).listRoots()).toThrow(NotFoundException);
      await expect(make({ enabled: false }).listContents(idOf(BUCKET, ''))).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rejects a malformed id (400)', async () => {
      // "YWJj" is base64 of "abc" → JSON.parse fails.
      await expect(make().listContents('YWJj')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an id for a non-configured bucket (403)', async () => {
      await expect(make().listContents(idOf('other-bucket', ''))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('status', () => {
    it('reports disconnected + no roots when disabled', async () => {
      await expect(make({ enabled: false }).status()).resolves.toMatchObject({
        connected: false,
        roots: [],
      });
    });

    it('probes every bucket and reports connected + roots, caching the result', async () => {
      const provider = make({ buckets: ['b1', 'b2'] });

      const first = await provider.status();
      const second = await provider.status();

      expect(first).toMatchObject({ connected: true });
      expect(first.roots.map((r) => r.name)).toEqual(['b1', 'b2']);
      // Two buckets probed once; the second status() call is served from cache.
      expect(send).toHaveBeenCalledTimes(2);
      expect(second).toBe(first);
    });

    it('reports disconnected with an error message when the probe fails', async () => {
      send.mockRejectedValue({ $metadata: { httpStatusCode: 503 } });

      await expect(make().status()).resolves.toMatchObject({
        connected: false,
        error: S3_UNAVAILABLE_MESSAGE,
        roots: [],
      });
    });
  });

  describe('listRoots', () => {
    it('maps configured buckets to roots', async () => {
      const roots = await make({ buckets: ['b1', 'b2'] }).listRoots();

      expect(roots.map((root) => root.name)).toEqual(['b1', 'b2']);
      expect(roots[0].folderId).toBe(idOf('b1', ''));
    });
  });

  describe('listContents', () => {
    it('maps folders + files, skips markers, and paginates', async () => {
      send
        .mockResolvedValueOnce({
          CommonPrefixes: [{ Prefix: 'folder1/' }],
          Contents: [{ Key: 'file1.txt', Size: 10 }, { Key: 'folder1/' }],
          IsTruncated: true,
          NextContinuationToken: 'tok',
        })
        .mockResolvedValueOnce({
          Contents: [{ Key: 'file2.txt', Size: 20 }],
          IsTruncated: false,
        });

      const entries = await make().listContents(idOf(BUCKET, ''));

      expect(entries.map((e) => [e.name, e.isFolder])).toEqual([
        ['folder1', true],
        ['file1.txt', false],
        ['file2.txt', false],
      ]);
      expect(send).toHaveBeenCalledTimes(2);
    });

    it('maps a whole-backend failure to a 424 StorageDisconnectedException', async () => {
      send.mockRejectedValue({ $metadata: { httpStatusCode: 500 } });

      await expect(make().listContents(idOf(BUCKET, ''))).rejects.toBeInstanceOf(
        StorageDisconnectedException,
      );
    });

    it('rethrows a non-backend (per-item) error as-is', async () => {
      send.mockRejectedValue({ name: 'NoSuchKey' });

      await expect(make().listContents(idOf(BUCKET, ''))).rejects.not.toBeInstanceOf(
        StorageDisconnectedException,
      );
    });
  });

  describe('createFolder', () => {
    it('writes a zero-byte prefix marker and returns the folder entry', async () => {
      const result = await make().createFolder(idOf(BUCKET, 'dir/'), 'New');

      const put = sentCmds().find((c) => c.cmd === 'put');
      expect(put?.input).toMatchObject({ Bucket: BUCKET, Key: 'dir/New/' });
      expect(result).toMatchObject({ name: 'New', isFolder: true });
    });
  });

  describe('deleteItem', () => {
    it('refuses to delete a bucket root (409)', async () => {
      await expect(make().deleteItem(idOf(BUCKET, ''))).rejects.toBeInstanceOf(ConflictException);
    });

    it('deletes a single object', async () => {
      await make().deleteItem(idOf(BUCKET, 'a.txt'));

      expect(sentCmds().find((c) => c.cmd === 'delete')?.input).toMatchObject({ Key: 'a.txt' });
    });

    it('deletes a folder prefix and everything under it', async () => {
      send
        .mockResolvedValueOnce({ Contents: [{ Key: 'p/a' }, { Key: 'p/' }], IsTruncated: false })
        .mockResolvedValueOnce({});

      await make().deleteItem(idOf(BUCKET, 'p/'));

      const many = sentCmds().find((c) => c.cmd === 'deleteMany');
      expect(many).toBeDefined();
    });
  });

  describe('renameItem', () => {
    it('refuses to rename a bucket (409)', async () => {
      await expect(make().renameItem(idOf(BUCKET, ''), 'x')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('renames a file via copy + delete, keeping its parent prefix', async () => {
      send
        .mockResolvedValueOnce({}) // copy
        .mockResolvedValueOnce({}) // delete
        .mockResolvedValueOnce({ ContentLength: 5 }); // head

      const result = await make().renameItem(idOf(BUCKET, 'dir/old.txt'), 'new.txt');

      const copy = sentCmds().find((c) => c.cmd === 'copy');
      const del = sentCmds().find((c) => c.cmd === 'delete');
      expect(copy?.input).toMatchObject({ Key: 'dir/new.txt' });
      expect(del?.input).toMatchObject({ Key: 'dir/old.txt' });
      expect(result).toMatchObject({ name: 'new.txt', isFolder: false, size: 5 });
    });
  });

  describe('moveItem', () => {
    it('rejects a non-folder target (400)', async () => {
      await expect(
        make().moveItem(idOf(BUCKET, 'a.txt'), idOf(BUCKET, 'x.txt')),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects moving a folder into itself (400)', async () => {
      await expect(
        make().moveItem(idOf(BUCKET, 'a/'), idOf(BUCKET, 'a/sub/')),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects moving a file into the folder it already lives in (400)', async () => {
      await expect(
        make().moveItem(idOf(BUCKET, 'dir/a.txt'), idOf(BUCKET, 'dir/')),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('moves a file via copy + delete into the target folder', async () => {
      send
        .mockResolvedValueOnce({}) // copy
        .mockResolvedValueOnce({}) // delete
        .mockResolvedValueOnce({ ContentLength: 7 }); // head

      const result = await make().moveItem(idOf(BUCKET, 'a.txt'), idOf(BUCKET, 'dir/'));

      expect(sentCmds().find((c) => c.cmd === 'copy')?.input).toMatchObject({ Key: 'dir/a.txt' });
      expect(result).toMatchObject({ name: 'a.txt', isFolder: false });
    });
  });

  describe('resolveNames', () => {
    it('names a bucket root by its bucket and a key by its basename', async () => {
      const result = await make().resolveNames([idOf(BUCKET, ''), idOf(BUCKET, 'dir/sub/')]);

      expect(result).toEqual([
        { id: idOf(BUCKET, ''), name: BUCKET },
        { id: idOf(BUCKET, 'dir/sub/'), name: 'sub' },
      ]);
    });

    it('rejects an id for a non-configured bucket (403)', () => {
      expect(() => make().resolveNames([idOf('other', 'x/')])).toThrow(ForbiddenException);
    });
  });

  describe('createFolderArchive', () => {
    it('refuses to ZIP a bucket root (400)', async () => {
      await expect(make().createFolderArchive(idOf(BUCKET, ''))).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('returns an archive named after the prefix basename', async () => {
      const { name } = await make().createFolderArchive(idOf(BUCKET, 'dir/sub/'));

      expect(name).toBe('sub');
    });
  });

  describe('downloadFile', () => {
    it('refuses to download a folder or bucket root (400)', async () => {
      await expect(make().downloadFile(idOf(BUCKET, ''))).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(make().downloadFile(idOf(BUCKET, 'p/'))).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('returns the object stream, name, mime and size', async () => {
      send.mockResolvedValue({ Body: 'stream', ContentType: 'text/plain', ContentLength: 9 });

      const result = await make().downloadFile(idOf(BUCKET, 'a.txt'));

      expect(result).toMatchObject({ name: 'a.txt', mimeType: 'text/plain', size: 9 });
      expect(result.stream).toBe('stream');
    });
  });

  describe('uploadFile', () => {
    it('streams the upload, logs SUCCESS and returns the result', async () => {
      send.mockResolvedValue({ ContentLength: 100 }); // head

      const result = await make().uploadFile(idOf(BUCKET, 'dir/'), {
        body: {} as never,
        fileName: 'f.txt',
        mimeType: 'text/plain',
      });

      expect(result).toEqual({
        fileId: idOf(BUCKET, 'dir/f.txt'),
        fileName: 'f.txt',
        size: 100,
        webViewLink: null,
      });
      expect(prisma.uploadLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'SUCCESS' }) }),
      );
    });

    it('logs FAILED and rethrows when the upload fails', async () => {
      uploadDone.mockRejectedValue(new Error('nope'));

      await expect(
        make().uploadFile(idOf(BUCKET, 'dir/'), {
          body: {} as never,
          fileName: 'f.txt',
          mimeType: 'text/plain',
        }),
      ).rejects.toThrow('nope');

      expect(prisma.uploadLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'FAILED', error: 'nope' }),
        }),
      );
    });
  });
});
