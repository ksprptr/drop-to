/* eslint-disable no-await-in-loop */
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Archiver, ZipArchive } from 'archiver';
import { Readable } from 'node:stream';

import { type S3Config, s3Config } from '@/config/s3.config';
import { AllowedFolderEntity } from '@/modules/google-auth/entities/allowed-folder.entity';
import { PrismaService } from '@/prisma/prisma.service';

import { DriveEntryEntity } from '../entities/drive-entry.entity';
import { StorageStatusEntity } from '../entities/storage-status.entity';
import { UploadResultEntity } from '../entities/upload-result.entity';
import {
  StorageArchive,
  StorageBackend,
  StorageDownload,
  StorageProvider,
  StorageUpload,
} from '../interfaces/storage-provider.interface';
import {
  isS3Unavailable,
  S3_UNAVAILABLE_MESSAGE,
  StorageDisconnectedException,
} from '../storage.errors';

/** Marker used for zero-byte "folder" objects (a prefix ending in a slash). */
const FOLDER_SUFFIX = '/';

/** Common extension → MIME map so previews (images especially) work in the UI. */
const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  avif: 'image/avif',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  pdf: 'application/pdf',
  zip: 'application/zip',
  json: 'application/json',
  txt: 'text/plain',
  csv: 'text/csv',
  md: 'text/markdown',
};

/**
 * A decoded S3 item reference: the bucket plus the key (a prefix ending in `/`
 * for folders, `''` for a bucket root, an object key otherwise).
 */
interface S3Ref {
  bucket: string;
  key: string;
}

/**
 * Encodes a bucket + key into an opaque, URL-path-safe id (S3 keys contain
 * slashes, so they cannot go into a route param raw).
 * @param ref - The bucket and key
 * @returns The opaque id
 */
function encodeId(ref: S3Ref): string {
  return Buffer.from(JSON.stringify([ref.bucket, ref.key])).toString('base64url');
}

/**
 * Decodes an opaque id back into its bucket and key.
 * @param id - The opaque id
 * @returns The bucket and key
 * @throws BadRequestException when the id is malformed
 */
function decodeId(id: string): S3Ref {
  try {
    const parsed = JSON.parse(Buffer.from(id, 'base64url').toString('utf8'));
    if (!Array.isArray(parsed) || typeof parsed[0] !== 'string' || typeof parsed[1] !== 'string') {
      throw new Error('shape');
    }
    return { bucket: parsed[0], key: parsed[1] };
  } catch {
    throw new BadRequestException('Invalid item id.');
  }
}

/**
 * Returns the last path segment of an S3 key (folder or file name).
 * @param key - The S3 key (may end in a slash for folders)
 * @returns The display name
 */
function baseName(key: string): string {
  const trimmed = key.endsWith(FOLDER_SUFFIX) ? key.slice(0, -1) : key;
  const slash = trimmed.lastIndexOf('/');

  return slash === -1 ? trimmed : trimmed.slice(slash + 1);
}

/**
 * Guesses a MIME type from a file name extension.
 * @param name - The file name
 * @returns The guessed MIME type (octet-stream when unknown)
 */
function guessMimeType(name: string): string {
  const dot = name.lastIndexOf('.');
  const ext = dot === -1 ? '' : name.slice(dot + 1).toLowerCase();

  return MIME_BY_EXT[ext] ?? 'application/octet-stream';
}

/**
 * S3 implementation of {@link StorageProvider}.
 *
 * Each configured bucket (`S3_BUCKETS`) is a browse root, mirroring how the
 * Picker-authorized folders are roots for Google Drive. S3 has no real folders,
 * so "folders" are key prefixes: listing uses a `/` delimiter, and creating a
 * folder writes a zero-byte marker object at `prefix/`. Every operation asserts
 * the target bucket is one of the configured (allowed) buckets — no bucket from a
 * request is ever trusted. Works with AWS S3 and S3-compatible stores (via an
 * optional custom endpoint + path-style addressing).
 */
@Injectable()
export class S3StorageProvider implements StorageProvider {
  readonly backend: StorageBackend = 's3';

  private readonly logger = new Logger(S3StorageProvider.name);
  private readonly allowedBuckets: Set<string>;
  private client: S3Client | null = null;

  constructor(
    @Inject(s3Config.KEY) private readonly cfg: S3Config,
    private readonly prismaService: PrismaService,
  ) {
    this.allowedBuckets = new Set(cfg.buckets);
  }

  /**
   * Function to report whether S3 is enabled, reachable, and expose the configured
   * buckets as roots.
   *
   * When S3 is enabled the buckets may still not exist or the credentials may be
   * wrong, so every configured bucket is probed; if any probe fails the backend is
   * reported as disconnected with a clear error for the sidebar (rather than
   * letting the first browse blow up with a raw SDK 500).
   * @returns The backend status
   */
  async status(): Promise<StorageStatusEntity> {
    if (!this.cfg.enabled) {
      return { backend: this.backend, label: 'S3 Storage', connected: false, email: null, roots: [] };
    }

    try {
      const client = this.getClient();
      for (const bucket of this.cfg.buckets) {
        await client.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1 }));
      }
    } catch (error) {
      this.logger.warn(`S3 storage is unavailable: ${(error as Error).message}`);

      return {
        backend: this.backend,
        label: 'S3 Storage',
        connected: false,
        email: null,
        error: S3_UNAVAILABLE_MESSAGE,
        roots: [],
      };
    }

    return {
      backend: this.backend,
      label: 'S3 Storage',
      connected: true,
      email: null,
      roots: this.cfg.buckets.map((bucket) => ({ id: encodeId({ bucket, key: '' }), name: bucket })),
    };
  }

  /**
   * Function to list the configured buckets as browse roots.
   * @returns The buckets as root entries
   */
  listRoots(): Promise<AllowedFolderEntity[]> {
    this.ensureEnabled();

    return Promise.resolve(
      this.cfg.buckets.map((bucket) => ({
        id: encodeId({ bucket, key: '' }),
        folderId: encodeId({ bucket, key: '' }),
        name: bucket,
        createdAt: new Date(0),
      })),
    );
  }

  /**
   * Function to list the folders and files directly inside a bucket/prefix.
   * @param folderId - The opaque id of the bucket root or a prefix
   * @returns The entries, folders first
   */
  async listContents(folderId: string): Promise<DriveEntryEntity[]> {
    const ref = this.resolve(folderId);
    const client = this.getClient();

    const folders: DriveEntryEntity[] = [];
    const files: DriveEntryEntity[] = [];
    let token: string | undefined;

    try {
      do {
        const res = await client.send(
          new ListObjectsV2Command({
            Bucket: ref.bucket,
            Prefix: ref.key,
            Delimiter: FOLDER_SUFFIX,
            ContinuationToken: token,
          }),
        );

        for (const prefix of res.CommonPrefixes ?? []) {
          if (prefix.Prefix) {
            folders.push(this.toFolderEntry(ref.bucket, prefix.Prefix));
          }
        }

        for (const object of res.Contents ?? []) {
          // Skip the folder's own marker object and any nested folder markers.
          if (!object.Key || object.Key === ref.key || object.Key.endsWith(FOLDER_SUFFIX)) {
            continue;
          }
          files.push(this.toFileEntry(ref.bucket, object.Key, object.Size, object.LastModified));
        }

        token = res.IsTruncated ? res.NextContinuationToken : undefined;
      } while (token);
    } catch (error) {
      // A missing bucket / bad credentials / unreachable endpoint means the whole
      // backend is unusable — surface it as a clean "reconnect" error (424) rather
      // than a raw SDK 500 so the client can prompt and refresh the sidebar.
      if (isS3Unavailable(error)) {
        throw new StorageDisconnectedException(S3_UNAVAILABLE_MESSAGE);
      }
      throw error;
    }

    return [...folders, ...files];
  }

  /**
   * Function to create a "folder" (a zero-byte prefix marker) inside a bucket/prefix.
   * @param parentId - The opaque id of the parent bucket root or prefix
   * @param name - The new folder name
   * @returns The created folder entry
   */
  async createFolder(parentId: string, name: string): Promise<DriveEntryEntity> {
    const ref = this.resolve(parentId);
    const client = this.getClient();
    const key = `${ref.key}${name}${FOLDER_SUFFIX}`;

    await client.send(new PutObjectCommand({ Bucket: ref.bucket, Key: key, Body: '' }));

    return this.toFolderEntry(ref.bucket, key);
  }

  /**
   * Function to upload a file into a bucket/prefix, streamed through the SDK.
   * @param folderId - The opaque id of the destination bucket root or prefix
   * @param upload - The file stream plus its name, MIME type and abort signal
   * @returns The upload result
   */
  async uploadFile(folderId: string, upload: StorageUpload): Promise<UploadResultEntity> {
    const { body, fileName, mimeType, signal } = upload;
    const ref = this.resolve(folderId);
    const client = this.getClient();
    const key = `${ref.key}${fileName}`;

    const uploader = new Upload({
      client,
      params: { Bucket: ref.bucket, Key: key, Body: body, ContentType: mimeType },
    });

    const onAbort = () => void uploader.abort();
    signal?.addEventListener('abort', onAbort, { once: true });

    try {
      await uploader.done();

      const size = await this.headSize(ref.bucket, key);

      await this.prismaService.uploadLog.create({
        data: {
          fileName,
          folderId,
          fileId: key,
          size: size === null ? null : BigInt(size),
          status: 'SUCCESS',
        },
      });

      this.logger.log(`Uploaded "${fileName}" into ${ref.bucket}/${key}.`);

      return {
        fileId: encodeId({ bucket: ref.bucket, key }),
        fileName,
        size,
        webViewLink: null,
      };
    } catch (error) {
      // A client-cancelled upload isn't a real failure — don't record it.
      if (signal?.aborted) {
        throw error;
      }

      await this.prismaService.uploadLog.create({
        data: {
          fileName,
          folderId,
          status: 'FAILED',
          error: error instanceof Error ? error.message : String(error),
        },
      });

      throw error;
    } finally {
      signal?.removeEventListener('abort', onAbort);
    }
  }

  /**
   * Function to delete a file, or a folder (prefix) and everything under it.
   *
   * Bucket roots (the configured buckets) cannot be deleted.
   * @param itemId - The opaque id of the file or folder
   */
  async deleteItem(itemId: string): Promise<void> {
    const ref = this.resolve(itemId);
    const client = this.getClient();

    if (ref.key === '') {
      throw new ConflictException('Buckets cannot be deleted.');
    }

    if (ref.key.endsWith(FOLDER_SUFFIX)) {
      await this.deletePrefix(ref.bucket, ref.key);
    } else {
      await client.send(new DeleteObjectCommand({ Bucket: ref.bucket, Key: ref.key }));
    }

    this.logger.log(`Deleted ${ref.bucket}/${ref.key}.`);
  }

  /**
   * Function to rename a file, or a folder (prefix) and everything under it.
   *
   * S3 has no native rename, so this copies to the new key/prefix and deletes the
   * old one. The new name replaces the last path segment; the parent prefix and
   * the target bucket stay the same. Bucket roots cannot be renamed.
   * @param itemId - The opaque id of the file or folder
   * @param name - The new name (a single path segment, no slashes)
   * @returns The renamed item as an entry
   */
  async renameItem(itemId: string, name: string): Promise<DriveEntryEntity> {
    const ref = this.resolve(itemId);
    const client = this.getClient();

    if (ref.key === '') {
      throw new ConflictException('Buckets cannot be renamed.');
    }

    if (ref.key.endsWith(FOLDER_SUFFIX)) {
      // A folder is a prefix: prefix/old/ -> prefix/new/ (copy every object under it).
      const parent = ref.key.slice(0, -FOLDER_SUFFIX.length);
      const slash = parent.lastIndexOf('/');
      const newKey = `${slash === -1 ? '' : parent.slice(0, slash + 1)}${name}${FOLDER_SUFFIX}`;

      await this.renamePrefix(ref.bucket, ref.key, newKey);
      this.logger.log(`Renamed ${ref.bucket}/${ref.key} to ${newKey}.`);

      return this.toFolderEntry(ref.bucket, newKey);
    }

    const slash = ref.key.lastIndexOf('/');
    const newKey = `${slash === -1 ? '' : ref.key.slice(0, slash + 1)}${name}`;

    await client.send(
      new CopyObjectCommand({
        Bucket: ref.bucket,
        CopySource: this.copySource(ref.bucket, ref.key),
        Key: newKey,
      }),
    );
    await client.send(new DeleteObjectCommand({ Bucket: ref.bucket, Key: ref.key }));
    this.logger.log(`Renamed ${ref.bucket}/${ref.key} to ${newKey}.`);

    const size = await this.headSize(ref.bucket, newKey);

    return this.toFileEntry(ref.bucket, newKey, size ?? undefined, undefined);
  }

  /**
   * Function to open a readable stream of an object's contents for download.
   * @param fileId - The opaque id of the file
   * @returns The content stream plus name, MIME type and size
   */
  async downloadFile(fileId: string): Promise<StorageDownload> {
    const ref = this.resolve(fileId);
    const client = this.getClient();

    if (ref.key === '' || ref.key.endsWith(FOLDER_SUFFIX)) {
      throw new BadRequestException('Use the folder download endpoint for folders.');
    }

    const res = await client.send(new GetObjectCommand({ Bucket: ref.bucket, Key: ref.key }));
    const name = baseName(ref.key);

    return {
      stream: res.Body as Readable,
      name,
      mimeType: res.ContentType ?? guessMimeType(name),
      size: res.ContentLength ?? null,
    };
  }

  /**
   * Function to build a ZIP archive of a bucket/prefix and everything under it.
   * @param folderId - The opaque id of the bucket root or prefix
   * @returns The archive stream and the folder name
   */
  async createFolderArchive(folderId: string): Promise<StorageArchive> {
    const ref = this.resolve(folderId);
    const name = ref.key === '' ? ref.bucket : baseName(ref.key);
    const archive = new ZipArchive({ zlib: { level: 9 } });

    void this.appendPrefixToArchive(ref.bucket, ref.key, archive).then(
      () => archive.finalize(),
      (error: unknown) =>
        archive.destroy(error instanceof Error ? error : new Error(String(error))),
    );

    return { archive, name };
  }

  // --- Internals ----------------------------------------------------------------

  /**
   * Function to decode an id and assert its bucket is one of the configured buckets.
   * @param id - The opaque item id
   * @returns The validated bucket/key reference
   */
  private resolve(id: string): S3Ref {
    this.ensureEnabled();

    const ref = decodeId(id);
    if (!this.allowedBuckets.has(ref.bucket)) {
      throw new ForbiddenException('This bucket is not configured for browsing.');
    }

    return ref;
  }

  /**
   * Function to assert S3 is enabled before any operation runs.
   * @throws NotFoundException when S3 is disabled
   */
  private ensureEnabled(): void {
    if (!this.cfg.enabled) {
      throw new NotFoundException('S3 storage is not enabled.');
    }
  }

  /**
   * Function to lazily build (and cache) the S3 client from configuration.
   * @returns The S3 client
   */
  private getClient(): S3Client {
    if (!this.client) {
      this.client = new S3Client({
        region: this.cfg.region,
        credentials: {
          accessKeyId: this.cfg.accessKeyId,
          secretAccessKey: this.cfg.secretAccessKey,
        },
        ...(this.cfg.endpoint ? { endpoint: this.cfg.endpoint } : {}),
        forcePathStyle: this.cfg.forcePathStyle,
      });
    }

    return this.client;
  }

  /**
   * Function to fetch an object's size via a HEAD request.
   * @param bucket - The bucket
   * @param key - The object key
   * @returns The size in bytes, or null when unavailable
   */
  private async headSize(bucket: string, key: string): Promise<number | null> {
    try {
      const head = await this.getClient().send(
        new HeadObjectCommand({ Bucket: bucket, Key: key }),
      );

      return head.ContentLength ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Function to delete every object under a prefix (folder), in batches.
   * @param bucket - The bucket
   * @param prefix - The folder prefix (ending in a slash)
   */
  private async deletePrefix(bucket: string, prefix: string): Promise<void> {
    const client = this.getClient();
    let token: string | undefined;

    do {
      const res = await client.send(
        new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
      );

      const keys = (res.Contents ?? [])
        .map((object) => object.Key)
        .filter((key): key is string => Boolean(key));

      if (keys.length > 0) {
        await client.send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
          }),
        );
      }

      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
  }

  /**
   * Function to copy every object under a prefix to a new prefix, then delete the
   * originals — the S3 way to "rename" a folder.
   * @param bucket - The bucket
   * @param oldPrefix - The current folder prefix (ending in a slash)
   * @param newPrefix - The destination folder prefix (ending in a slash)
   */
  private async renamePrefix(
    bucket: string,
    oldPrefix: string,
    newPrefix: string,
  ): Promise<void> {
    const client = this.getClient();
    let token: string | undefined;

    do {
      const res = await client.send(
        new ListObjectsV2Command({ Bucket: bucket, Prefix: oldPrefix, ContinuationToken: token }),
      );

      for (const object of res.Contents ?? []) {
        if (!object.Key) {
          continue;
        }

        const destKey = `${newPrefix}${object.Key.slice(oldPrefix.length)}`;
        await client.send(
          new CopyObjectCommand({
            Bucket: bucket,
            CopySource: this.copySource(bucket, object.Key),
            Key: destKey,
          }),
        );
        await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: object.Key }));
      }

      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
  }

  /**
   * Function to build a URL-encoded `CopySource` value (`bucket/key`) that keeps
   * the key's path separators intact while escaping special characters per segment.
   * @param bucket - The bucket
   * @param key - The object key
   * @returns The encoded copy-source string
   */
  private copySource(bucket: string, key: string): string {
    const encodedKey = key
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');

    return `${bucket}/${encodedKey}`;
  }

  /**
   * Function to recursively append every object under a prefix into an archive.
   * @param bucket - The bucket
   * @param prefix - The folder prefix (`''` for a whole bucket)
   * @param archive - The archive to append entries to
   */
  private async appendPrefixToArchive(
    bucket: string,
    prefix: string,
    archive: Archiver,
  ): Promise<void> {
    const client = this.getClient();
    let token: string | undefined;

    do {
      const res = await client.send(
        new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
      );

      for (const object of res.Contents ?? []) {
        // Skip folder markers — they'd create bogus empty entries in the ZIP.
        if (!object.Key || object.Key.endsWith(FOLDER_SUFFIX)) {
          continue;
        }

        const entryPath = object.Key.slice(prefix.length) || baseName(object.Key);
        const body = await client.send(new GetObjectCommand({ Bucket: bucket, Key: object.Key }));
        archive.append(body.Body as Readable, { name: entryPath });
      }

      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
  }

  /**
   * Function to map an S3 prefix onto a folder entry.
   * @param bucket - The bucket
   * @param prefix - The folder prefix (ending in a slash)
   * @returns The folder entry
   */
  private toFolderEntry(bucket: string, prefix: string): DriveEntryEntity {
    return {
      id: encodeId({ bucket, key: prefix }),
      name: baseName(prefix),
      mimeType: 'application/x-directory',
      isFolder: true,
      size: null,
      modifiedTime: null,
      iconLink: null,
      webViewLink: null,
    };
  }

  /**
   * Function to map an S3 object onto a file entry.
   * @param bucket - The bucket
   * @param key - The object key
   * @param size - The object size in bytes
   * @param lastModified - The object's last-modified date
   * @returns The file entry
   */
  private toFileEntry(
    bucket: string,
    key: string,
    size: number | undefined,
    lastModified: Date | undefined,
  ): DriveEntryEntity {
    const name = baseName(key);

    return {
      id: encodeId({ bucket, key }),
      name,
      mimeType: guessMimeType(name),
      isFolder: false,
      size: size ?? null,
      modifiedTime: lastModified ? lastModified.toISOString() : null,
      iconLink: null,
      webViewLink: null,
    };
  }
}
