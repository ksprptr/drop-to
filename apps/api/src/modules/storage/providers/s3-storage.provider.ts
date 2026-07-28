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
import { ResolvedNameEntity } from '../entities/resolved-name.entity';
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
import { finalizeArchiveInBackground, sanitizeZipEntryPath } from '../storage.functions';
import { logUploadFailure, logUploadSuccess } from '../upload-log.functions';

/** Marker used for zero-byte "folder" objects (a prefix ending in a slash). */
const FOLDER_SUFFIX = '/';
const LABEL = 'S3 Storage';

// Cache the probed status; the sidebar polls often and we don't want to re-probe/re-log every request.
const STATUS_CACHE_TTL_MS = 30_000;

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

/** A decoded S3 item: bucket + key (prefix ending in `/` for folders, `''` for a bucket root). */
interface S3Ref {
  bucket: string;
  key: string;
}

/**
 * Encodes a bucket + key into an opaque, URL-path-safe id (keys contain slashes).
 **/
function encodeId(ref: S3Ref): string {
  return Buffer.from(JSON.stringify([ref.bucket, ref.key])).toString('base64url');
}

/**
 * Decodes an opaque id back into its bucket and key; 400 when malformed.
 **/
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
 * Returns the last path segment of an S3 key (the display name).
 **/
function baseName(key: string): string {
  const trimmed = key.endsWith(FOLDER_SUFFIX) ? key.slice(0, -1) : key;
  const slash = trimmed.lastIndexOf('/');

  return slash === -1 ? trimmed : trimmed.slice(slash + 1);
}

/**
 * Guesses a MIME type from a file name extension (octet-stream when unknown).
 **/
function guessMimeType(name: string): string {
  const dot = name.lastIndexOf('.');
  const ext = dot === -1 ? '' : name.slice(dot + 1).toLowerCase();

  return MIME_BY_EXT[ext] ?? 'application/octet-stream';
}

/**
 * StorageProvider over S3: each configured bucket is a browse root, "folders" are key prefixes, every op asserts the bucket is configured.
 **/
@Injectable()
export class S3StorageProvider implements StorageProvider {
  readonly backend: StorageBackend = 's3';

  private readonly logger = new Logger(S3StorageProvider.name);
  private readonly allowedBuckets: Set<string>;
  private client: S3Client | null = null;
  private statusCache: { entity: StorageStatusEntity; expiresAt: number } | null = null;
  private loggedUnavailable = false;

  constructor(
    @Inject(s3Config.KEY) private readonly cfg: S3Config,
    private readonly prismaService: PrismaService,
  ) {
    this.allowedBuckets = new Set(cfg.buckets);
  }

  /**
   * Probes every configured bucket; any failure → disconnected with a sidebar error.
   **/
  async status(): Promise<StorageStatusEntity> {
    if (!this.cfg.enabled) {
      return { backend: this.backend, label: LABEL, connected: false, email: null, roots: [] };
    }

    const now = Date.now();
    if (this.statusCache && this.statusCache.expiresAt > now) {
      return this.statusCache.entity;
    }

    let entity: StorageStatusEntity;

    try {
      const client = this.getClient();
      // Buckets are independent — probe them in parallel.
      await Promise.all(
        this.cfg.buckets.map((bucket) =>
          client.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1 })),
        ),
      );

      entity = {
        backend: this.backend,
        label: LABEL,
        connected: true,
        email: null,
        roots: this.cfg.buckets.map((bucket) => ({
          id: encodeId({ bucket, key: '' }),
          name: bucket,
        })),
      };
      this.loggedUnavailable = false;
    } catch (error) {
      // Log only when the backend first becomes unavailable, not on every poll.
      if (!this.loggedUnavailable) {
        this.logger.warn(`S3 storage is unavailable: ${(error as Error).message}`);
        this.loggedUnavailable = true;
      }

      entity = {
        backend: this.backend,
        label: LABEL,
        connected: false,
        email: null,
        error: S3_UNAVAILABLE_MESSAGE,
        roots: [],
      };
    }

    this.statusCache = { entity, expiresAt: now + STATUS_CACHE_TTL_MS };

    return entity;
  }

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
      // Whole-backend failure → clean 424 so the client can prompt a reconnect.
      if (isS3Unavailable(error)) {
        throw new StorageDisconnectedException(S3_UNAVAILABLE_MESSAGE);
      }
      throw error;
    }

    return [...folders, ...files];
  }

  resolveNames(ids: string[]): Promise<ResolvedNameEntity[]> {
    return Promise.resolve(
      ids.map((id) => {
        const ref = this.resolve(id);

        return { id, name: ref.key === '' ? ref.bucket : baseName(ref.key) };
      }),
    );
  }

  /**
   * Creates a "folder" as a zero-byte prefix marker object.
   **/
  async createFolder(parentId: string, name: string): Promise<DriveEntryEntity> {
    const ref = this.resolve(parentId);
    const client = this.getClient();
    const key = `${ref.key}${name}${FOLDER_SUFFIX}`;

    await client.send(new PutObjectCommand({ Bucket: ref.bucket, Key: key, Body: '' }));

    return this.toFolderEntry(ref.bucket, key);
  }

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

      await logUploadSuccess(this.prismaService, { fileName, folderId, fileId: key, size });

      this.logger.log(`Uploaded "${fileName}" into ${ref.bucket}/${key}.`);

      return {
        fileId: encodeId({ bucket: ref.bucket, key }),
        fileName,
        size,
        webViewLink: null,
      };
    } catch (error) {
      await logUploadFailure(this.prismaService, { fileName, folderId, error, signal });
      throw error;
    } finally {
      signal?.removeEventListener('abort', onAbort);
    }
  }

  /**
   * Deletes a file, or a folder prefix and everything under it; buckets can't be deleted (409).
   **/
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
   * Renames via copy + delete (S3 has no native rename); buckets can't be renamed (409).
   **/
  async renameItem(itemId: string, name: string): Promise<DriveEntryEntity> {
    const ref = this.resolve(itemId);
    const client = this.getClient();

    if (ref.key === '') {
      throw new ConflictException('Buckets cannot be renamed.');
    }

    if (ref.key.endsWith(FOLDER_SUFFIX)) {
      // Folder rename: prefix/old/ -> prefix/new/ (copies every object under it).
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
   * Moves via copy + delete (S3 has no native move, works cross-bucket); buckets can't be moved (409).
   **/
  async moveItem(itemId: string, targetFolderId: string): Promise<DriveEntryEntity> {
    const src = this.resolve(itemId);
    const dest = this.resolve(targetFolderId);
    const client = this.getClient();

    if (src.key === '') {
      throw new ConflictException('Buckets cannot be moved.');
    }
    if (dest.key !== '' && !dest.key.endsWith(FOLDER_SUFFIX)) {
      throw new BadRequestException('The move target must be a folder.');
    }

    const name = baseName(src.key);

    if (src.key.endsWith(FOLDER_SUFFIX)) {
      const newPrefix = `${dest.key}${name}${FOLDER_SUFFIX}`;
      if (src.bucket === dest.bucket && newPrefix.startsWith(src.key)) {
        throw new BadRequestException('Cannot move a folder into itself.');
      }

      await this.copyPrefix(src.bucket, src.key, dest.bucket, newPrefix);
      await this.deletePrefix(src.bucket, src.key);
      this.logger.log(`Moved ${src.bucket}/${src.key} to ${dest.bucket}/${newPrefix}.`);

      return this.toFolderEntry(dest.bucket, newPrefix);
    }

    const newKey = `${dest.key}${name}`;
    if (src.bucket === dest.bucket && newKey === src.key) {
      // Copy-onto-itself then delete would lose the object.
      throw new BadRequestException('The item is already in that folder.');
    }

    await client.send(
      new CopyObjectCommand({
        Bucket: dest.bucket,
        CopySource: this.copySource(src.bucket, src.key),
        Key: newKey,
      }),
    );
    await client.send(new DeleteObjectCommand({ Bucket: src.bucket, Key: src.key }));
    this.logger.log(`Moved ${src.bucket}/${src.key} to ${dest.bucket}/${newKey}.`);

    const size = await this.headSize(dest.bucket, newKey);

    return this.toFileEntry(dest.bucket, newKey, size ?? undefined, undefined);
  }

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

  async createFolderArchive(folderId: string): Promise<StorageArchive> {
    const ref = this.resolve(folderId);

    if (ref.key === '') {
      throw new BadRequestException('Buckets cannot be downloaded as a ZIP.');
    }

    const name = baseName(ref.key);
    const archive = new ZipArchive({ zlib: { level: 9 } });

    finalizeArchiveInBackground(archive, this.appendPrefixToArchive(ref.bucket, ref.key, archive));

    return { archive, name };
  }

  // --- Internals ----------------------------------------------------------------

  /**
   * Decodes an id and asserts its bucket is configured (else 403).
   **/
  private resolve(id: string): S3Ref {
    this.ensureEnabled();

    const ref = decodeId(id);
    if (!this.allowedBuckets.has(ref.bucket)) {
      throw new ForbiddenException('This bucket is not configured for browsing.');
    }

    return ref;
  }

  /**
   * Asserts S3 is enabled (else 404).
   **/
  private ensureEnabled(): void {
    if (!this.cfg.enabled) {
      throw new NotFoundException('S3 storage is not enabled.');
    }
  }

  /**
   * Lazily builds and caches the S3 client from configuration.
   **/
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
   * Fetches an object's size via HEAD (null when unavailable).
   **/
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
   * Deletes every object under a prefix, in batches.
   **/
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
   * Copies every object under a prefix to a new prefix, then deletes the originals.
   **/
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
   * Copies every object under a prefix to a new bucket/prefix (the copy half of a move).
   **/
  private async copyPrefix(
    srcBucket: string,
    srcPrefix: string,
    destBucket: string,
    destPrefix: string,
  ): Promise<void> {
    const client = this.getClient();
    let token: string | undefined;

    do {
      const res = await client.send(
        new ListObjectsV2Command({ Bucket: srcBucket, Prefix: srcPrefix, ContinuationToken: token }),
      );

      for (const object of res.Contents ?? []) {
        if (!object.Key) {
          continue;
        }

        const destKey = `${destPrefix}${object.Key.slice(srcPrefix.length)}`;
        await client.send(
          new CopyObjectCommand({
            Bucket: destBucket,
            CopySource: this.copySource(srcBucket, object.Key),
            Key: destKey,
          }),
        );
      }

      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
  }

  /**
   * Builds a `CopySource` (`bucket/key`), escaping per segment to keep path separators.
   **/
  private copySource(bucket: string, key: string): string {
    const encodedKey = key
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');

    return `${bucket}/${encodedKey}`;
  }

  /**
   * Appends every object under a prefix into the archive.
   **/
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
        archive.append(body.Body as Readable, { name: sanitizeZipEntryPath(entryPath) });
      }

      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
  }

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
