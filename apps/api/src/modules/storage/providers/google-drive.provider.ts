/* eslint-disable no-await-in-loop */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Archiver, ZipArchive } from 'archiver';
import { Auth, drive_v3, google } from 'googleapis';
import { Readable } from 'node:stream';

import { TtlCache } from '@/common/utils/ttl-cache.functions';
import {
  AllowedFolderEntity,
  toAllowedFolderEntity,
} from '@/modules/google-auth/entities/allowed-folder.entity';
import { GoogleAuthService } from '@/modules/google-auth/google-auth.service';
import { PrismaService } from '@/prisma/prisma.service';

import { DriveEntryEntity } from '../entities/drive-entry.entity';
import { ResolvedNameEntity } from '../entities/resolved-name.entity';
import { StorageStatusEntity } from '../entities/storage-status.entity';
import { UploadResultEntity } from '../entities/upload-result.entity';
import { UploadStatusEntity } from '../entities/upload-status.entity';
import {
  ContentsPage,
  ListContentsOptions,
  ResumableUploadInit,
  StorageArchive,
  StorageBackend,
  StorageDownload,
  StorageProvider,
  StorageUpload,
} from '../interfaces/storage-provider.interface';
import {
  DRIVE_DISCONNECTED_MESSAGE,
  isInvalidGrant,
  isNotFoundError,
  StorageDisconnectedException,
} from '../storage.errors';
import { finalizeArchiveInBackground, sanitizeZipEntryPath } from '../storage.functions';

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const MAX_ANCESTOR_DEPTH = 50;
const LABEL = 'Google Drive';
/** Shown when the target was deleted (or trashed) in Drive outside the app. */
const ITEM_MISSING_MESSAGE = 'This item no longer exists in Google Drive.';
// One network page. Small enough to keep first paint fast, big enough that most folders need one call.
const PAGE_SIZE = 100;

/** How long a folder's parent list stays trusted. Ancestry changes only when a folder is moved. */
const ANCESTOR_CACHE_TTL_MS = 60_000;

const ANCESTOR_CACHE_MAX = 500;

/**
 * StorageProvider over the Drive API; every op is validated to stay inside the authorized folder tree.
 **/
@Injectable()
export class GoogleDriveProvider implements StorageProvider {
  readonly backend: StorageBackend = 'drive';

  // Ancestry of *intermediate* folders only — the target item is always re-read, so a deleted item
  // still 404s. Keyed by folder id; a moved folder is at worst one TTL stale.
  private readonly ancestorCache = new TtlCache<string[]>(ANCESTOR_CACHE_TTL_MS, ANCESTOR_CACHE_MAX);

  private readonly logger = new Logger(GoogleDriveProvider.name);

  constructor(
    private readonly googleAuthService: GoogleAuthService,
    private readonly prismaService: PrismaService,
  ) {}

  async status(): Promise<StorageStatusEntity> {
    const status = await this.googleAuthService.getStatus();

    if (!status.connected) {
      return { backend: this.backend, label: LABEL, connected: false, email: null, roots: [] };
    }

    // Probe the token so a dead one shows "reconnect" instead of a false "connected".
    let quota: { usage: number; limit: number | null } | null = null;
    let folders = status.allowedFolders;
    try {
      const accountId = await this.googleAuthService.getActiveAccountId();
      const auth = await this.googleAuthService.getAuthorizedClient(accountId);
      await auth.getAccessToken();
      quota = await this.fetchQuota(auth);
      // The owner can delete an authorized folder in Drive; don't offer it as a browse root.
      folders = await this.pruneMissingRoots(
        google.drive({ version: 'v3', auth }),
        accountId,
        folders,
      );
    } catch (error) {
      if (isInvalidGrant(error)) {
        return {
          backend: this.backend,
          label: LABEL,
          connected: false,
          email: status.email,
          error: DRIVE_DISCONNECTED_MESSAGE,
          roots: [],
        };
      }
      // A transient error shouldn't nuke a working connection — report it as connected.
    }

    return {
      backend: this.backend,
      label: LABEL,
      connected: true,
      email: status.email,
      roots: folders.map((folder) => ({ id: folder.folderId, name: folder.name })),
      quota,
    };
  }

  /**
   * The connected account's storage usage (`about.get`); best-effort — null if it can't be read.
   **/
  private async fetchQuota(
    auth: Auth.OAuth2Client,
  ): Promise<{ usage: number; limit: number | null } | null> {
    try {
      const drive = google.drive({ version: 'v3', auth });
      const res = await drive.about.get({ fields: 'storageQuota' });
      const storageQuota = res.data.storageQuota;

      if (!storageQuota) {
        return null;
      }

      const usage = Number(storageQuota.usage ?? 0);
      const limit = storageQuota.limit != null ? Number(storageQuota.limit) : null;

      return {
        usage: Number.isFinite(usage) ? usage : 0,
        limit: limit !== null && Number.isFinite(limit) ? limit : null,
      };
    } catch {
      return null;
    }
  }

  private async getDrive(driveAccountId: string): Promise<drive_v3.Drive> {
    const auth = await this.googleAuthService.getAuthorizedClient(driveAccountId);

    // Refresh up front so a dead token surfaces as a clean 424, not a raw googleapis 500.
    try {
      await auth.getAccessToken();
    } catch (error) {
      if (isInvalidGrant(error)) {
        throw new StorageDisconnectedException(DRIVE_DISCONNECTED_MESSAGE);
      }
      // Transient network error — clean 503; never let the raw gaxios error (carries the refresh token) reach the logger.
      this.logger.warn(`Google Drive token refresh failed: ${(error as Error).message}`);
      throw new ServiceUnavailableException('Google Drive is temporarily unreachable. Try again.');
    }

    return google.drive({ version: 'v3', auth });
  }

  private async getAllowedFolderIds(driveAccountId: string): Promise<Set<string>> {
    const folders = await this.prismaService.allowedFolder.findMany({
      where: { driveAccountId },
      select: { folderId: true },
    });

    return new Set(folders.map((folder) => folder.folderId));
  }

  /**
   * Reads the target's parents. Gone in Drive (deleted/trashed) → 404; unreadable for any other
   * reason → null, letting the ancestor walk end in the usual 403.
   **/
  private async getItemParents(drive: drive_v3.Drive, itemId: string): Promise<string[] | null> {
    try {
      const res = await drive.files.get({ fileId: itemId, fields: 'id, parents, trashed' });

      if (res.data.trashed) {
        throw new NotFoundException(ITEM_MISSING_MESSAGE);
      }

      return res.data.parents ?? [];
    } catch (error) {
      if (error instanceof NotFoundException || isNotFoundError(error)) {
        throw new NotFoundException(ITEM_MISSING_MESSAGE);
      }

      return null;
    }
  }

  /**
   * Passes if the id is an authorized root or has one as an ancestor; else 403. Authorized roots are
   * still verified against Drive — the owner can delete one there, and the stale id would otherwise
   * reach the API and blow up as an unhandled 404.
   **/
  private async assertItemAllowed(
    drive: drive_v3.Drive,
    itemId: string,
    allowedIds: Set<string>,
  ): Promise<void> {
    const itemParents = await this.getItemParents(drive, itemId);

    if (allowedIds.has(itemId)) {
      return;
    }

    const visited = new Set<string>([itemId]);
    let frontier = itemParents ?? [];
    let depth = 0;

    while (frontier.length > 0 && depth < MAX_ANCESTOR_DEPTH) {
      const next: string[] = [];

      for (const id of frontier) {
        if (allowedIds.has(id)) {
          return;
        }
        if (visited.has(id)) {
          continue;
        }
        visited.add(id);

        const cached = this.ancestorCache.get(id);

        if (cached) {
          next.push(...cached);
          continue;
        }

        try {
          const res = await drive.files.get({ fileId: id, fields: 'id, parents' });
          const parents = res.data.parents ?? [];

          this.ancestorCache.set(id, parents);
          next.push(...parents);
        } catch {
          // Not reachable (deleted / no access) — treat as not allowed.
          continue;
        }
      }

      frontier = next;
      depth += 1;
    }

    throw new ForbiddenException('This folder is outside the authorized folders.');
  }

  /**
   * Drops authorized roots that are gone from Drive so the sidebar never offers a folder every
   * later call would 404 on. A hard 404 means gone for good → the authorization is pruned too;
   * trashed folders are only hidden (restoring one in Drive brings it back).
   **/
  private async pruneMissingRoots(
    drive: drive_v3.Drive,
    driveAccountId: string,
    folders: AllowedFolderEntity[],
  ): Promise<AllowedFolderEntity[]> {
    const checked = await Promise.all(
      folders.map(async (folder) => {
        try {
          const res = await drive.files.get({ fileId: folder.folderId, fields: 'id, trashed' });

          return { folder, live: !res.data.trashed, gone: false };
        } catch (error) {
          // Only a hard 404 is proof; a transient failure must never hide a working root.
          const gone = isNotFoundError(error);

          return { folder, live: !gone, gone };
        }
      }),
    );

    const gone = checked.filter((entry) => entry.gone).map((entry) => entry.folder.id);

    if (gone.length > 0) {
      await this.prismaService.allowedFolder.deleteMany({
        where: { driveAccountId, id: { in: gone } },
      });
      this.logger.log(`Dropped ${gone.length} authorized folder(s) deleted from Drive.`);
    }

    return checked.filter((entry) => entry.live).map((entry) => entry.folder);
  }

  async listRoots(): Promise<AllowedFolderEntity[]> {
    const driveAccountId = await this.googleAuthService.getActiveAccountId();
    const drive = await this.getDrive(driveAccountId);
    const folders = await this.prismaService.allowedFolder.findMany({
      where: { driveAccountId },
      select: { id: true, folderId: true, name: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    // Deliberately uncached: this call's whole job is to tell the sidebar which roots are still
    // live in Drive, and it is already one parallel files.get per root. Caching it made a root
    // deleted in Drive linger in the list (an e2e test caught exactly that).
    return this.pruneMissingRoots(drive, driveAccountId, folders.map(toAllowedFolderEntity));
  }

  async listContents(folderId: string, options: ListContentsOptions = {}): Promise<ContentsPage> {
    const driveAccountId = await this.googleAuthService.getActiveAccountId();
    const drive = await this.getDrive(driveAccountId);
    const allowedIds = await this.getAllowedFolderIds(driveAccountId);

    await this.assertItemAllowed(drive, folderId, allowedIds);

    const res = await drive.files.list({
      q: this.buildContentsQuery(folderId, options.search),
      fields: 'nextPageToken, files(id, name, mimeType, size, modifiedTime, iconLink, webViewLink)',
      orderBy: this.buildOrderBy(options.sortKey, options.sortDir),
      pageSize: PAGE_SIZE,
      pageToken: options.pageToken,
    });

    return {
      entries: (res.data.files ?? []).map((file) => this.toDriveEntry(file)),
      nextPageToken: res.data.nextPageToken ?? null,
    };
  }

  /**
   * Builds the Drive `q` for a folder's children; escapes the search term to prevent query injection.
   **/
  private buildContentsQuery(folderId: string, search: string | undefined): string {
    let query = `'${folderId}' in parents and trashed = false`;

    const term = search?.trim();
    if (term) {
      const escaped = term.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      query += ` and name contains '${escaped}'`;
    }

    return query;
  }

  /**
   * Maps the UI sort to a Drive `orderBy`, with `folder` leading so folders group before files.
   **/
  private buildOrderBy(
    sortKey: ListContentsOptions['sortKey'],
    sortDir: ListContentsOptions['sortDir'],
  ): string {
    const field =
      sortKey === 'modified' ? 'modifiedTime' : sortKey === 'size' ? 'quotaBytesUsed' : 'name';
    const direction = sortDir === 'desc' ? ' desc' : '';

    return `folder,${field}${direction}`;
  }

  async resolveNames(ids: string[]): Promise<ResolvedNameEntity[]> {
    const driveAccountId = await this.googleAuthService.getActiveAccountId();
    const drive = await this.getDrive(driveAccountId);
    const allowedIds = await this.getAllowedFolderIds(driveAccountId);

    // Breadcrumb names + Drive links. Each id is validated against the authorized tree first: the
    // OAuth grant covers the owner's whole Drive, so without this an operator could read the name
    // and link of any file whose id they know. Ids outside the tree resolve to the same empty
    // placeholder as unreachable ones, so a denied lookup is indistinguishable from a missing one.
    return Promise.all(
      ids.map(async (id) => {
        const empty = { id, name: '', webViewLink: null };

        try {
          await this.assertItemAllowed(drive, id, allowedIds);
        } catch {
          return empty;
        }

        try {
          const res = await drive.files.get({ fileId: id, fields: 'id, name, webViewLink' });
          return { id, name: res.data.name ?? '', webViewLink: res.data.webViewLink ?? null };
        } catch {
          return empty;
        }
      }),
    );
  }

  async createFolder(parentId: string, name: string): Promise<DriveEntryEntity> {
    const driveAccountId = await this.googleAuthService.getActiveAccountId();
    const drive = await this.getDrive(driveAccountId);
    const allowedIds = await this.getAllowedFolderIds(driveAccountId);

    await this.assertItemAllowed(drive, parentId, allowedIds);

    const res = await drive.files.create({
      requestBody: { name, mimeType: FOLDER_MIME, parents: [parentId] },
      fields: 'id, name, mimeType, size, modifiedTime, iconLink, webViewLink',
    });

    return this.toDriveEntry(res.data);
  }

  async uploadFile(folderId: string, upload: StorageUpload): Promise<UploadResultEntity> {
    const { body, fileName, mimeType, signal } = upload;
    const driveAccountId = await this.googleAuthService.getActiveAccountId();
    const drive = await this.getDrive(driveAccountId);
    const allowedIds = await this.getAllowedFolderIds(driveAccountId);

    await this.assertItemAllowed(drive, folderId, allowedIds);

    const res = await drive.files.create(
      {
        requestBody: { name: fileName, parents: [folderId] },
        media: { mimeType, body },
        fields: 'id, name, size, webViewLink',
      },
      { signal },
    );

    const size = this.parseSize(res.data.size);

    this.logger.log(`Uploaded "${fileName}" (${res.data.id}) into ${folderId}.`);

    return {
      fileId: res.data.id ?? '',
      fileName: res.data.name ?? fileName,
      size,
      webViewLink: res.data.webViewLink ?? null,
    };
  }

  /**
   * Opens a Drive resumable upload session server-side; the validated parent is baked in so the browser can't redirect the file elsewhere.
   **/
  async createResumableUpload(
    folderId: string,
    init: ResumableUploadInit,
  ): Promise<{ uploadUrl: string }> {
    const driveAccountId = await this.googleAuthService.getActiveAccountId();
    const drive = await this.getDrive(driveAccountId);
    const allowedIds = await this.getAllowedFolderIds(driveAccountId);

    await this.assertItemAllowed(drive, folderId, allowedIds);

    const auth = await this.googleAuthService.getAuthorizedClient(driveAccountId);
    const { token } = await auth.getAccessToken();

    if (!token) {
      throw new ServiceUnavailableException('Google Drive is temporarily unreachable. Try again.');
    }

    const response = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Type': init.mimeType,
          'X-Upload-Content-Length': String(init.size),
          // Lets Google return a session that a browser at this origin may PUT to (CORS).
          Origin: init.origin,
        },
        body: JSON.stringify({ name: init.name, parents: [folderId], mimeType: init.mimeType }),
      },
    );

    const uploadUrl = response.headers.get('location');

    if (!response.ok || !uploadUrl) {
      this.logger.warn(`Failed to open a Drive upload session (status ${response.status}).`);
      throw new ServiceUnavailableException('Could not start the upload. Try again.');
    }

    return { uploadUrl };
  }

  /**
   * Queries how far a resumable session got (server-side, where CORS doesn't hide `Range`) so the browser can resume from `receivedBytes`.
   **/
  async getUploadStatus(uploadUrl: string, size: number): Promise<UploadStatusEntity> {
    if (!uploadUrl.startsWith('https://www.googleapis.com/upload/drive/')) {
      throw new BadRequestException('Invalid upload URL.');
    }

    const res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Range': `bytes */${size}` },
    });

    if (res.status === 200 || res.status === 201) {
      const data = (await res.json().catch(() => null)) as { id?: string } | null;
      return { complete: true, receivedBytes: size, fileId: data?.id ?? null };
    }

    if (res.status === 308) {
      // "Range: bytes=0-N" → N+1 bytes received; absent header → nothing received yet.
      const range = res.headers.get('range');
      const received = range ? Number(range.split('-')[1]) + 1 : 0;
      return {
        complete: false,
        receivedBytes: Number.isFinite(received) ? received : 0,
        fileId: null,
      };
    }

    throw new ServiceUnavailableException('Could not query the upload status. Try again.');
  }

  /**
   * Validates a browser-completed resumable upload lands inside the authorized tree, records it, and returns the stored file.
   **/
  async finalizeUpload(fileId: string): Promise<UploadResultEntity> {
    const driveAccountId = await this.googleAuthService.getActiveAccountId();
    const drive = await this.getDrive(driveAccountId);
    const allowedIds = await this.getAllowedFolderIds(driveAccountId);

    await this.assertItemAllowed(drive, fileId, allowedIds);

    const res = await drive.files.get({
      fileId,
      fields: 'id, name, size, parents, webViewLink',
    });

    const size = this.parseSize(res.data.size);
    const fileName = res.data.name ?? '';

    this.logger.log(`Finalized upload "${fileName}" (${res.data.id}).`);

    return {
      fileId: res.data.id ?? fileId,
      fileName,
      size,
      webViewLink: res.data.webViewLink ?? null,
    };
  }

  /**
   * Deletes an item in the authorized tree; authorized roots cannot be deleted (409).
   **/
  async deleteItem(itemId: string): Promise<void> {
    const driveAccountId = await this.googleAuthService.getActiveAccountId();
    const drive = await this.getDrive(driveAccountId);
    const allowedIds = await this.getAllowedFolderIds(driveAccountId);

    if (allowedIds.has(itemId)) {
      throw new ConflictException('Authorized root folders cannot be deleted.');
    }

    await this.assertItemAllowed(drive, itemId, allowedIds);

    await drive.files.delete({ fileId: itemId });

    this.logger.log(`Deleted item ${itemId}.`);
  }

  /**
   * Renames an item in the authorized tree; authorized roots cannot be renamed (409).
   **/
  async renameItem(itemId: string, name: string): Promise<DriveEntryEntity> {
    const driveAccountId = await this.googleAuthService.getActiveAccountId();
    const drive = await this.getDrive(driveAccountId);
    const allowedIds = await this.getAllowedFolderIds(driveAccountId);

    if (allowedIds.has(itemId)) {
      throw new ConflictException('Authorized root folders cannot be renamed.');
    }

    await this.assertItemAllowed(drive, itemId, allowedIds);

    const res = await drive.files.update({
      fileId: itemId,
      requestBody: { name },
      fields: 'id, name, mimeType, size, modifiedTime, iconLink, webViewLink',
    });

    this.logger.log(`Renamed item ${itemId} to "${name}".`);

    return this.toDriveEntry(res.data);
  }

  /**
   * Moves an item within the authorized tree; the target may be a root, but roots can't be moved (409).
   **/
  async moveItem(itemId: string, targetFolderId: string): Promise<DriveEntryEntity> {
    if (itemId === targetFolderId) {
      throw new BadRequestException('Cannot move an item into itself.');
    }

    const driveAccountId = await this.googleAuthService.getActiveAccountId();
    const drive = await this.getDrive(driveAccountId);
    const allowedIds = await this.getAllowedFolderIds(driveAccountId);

    if (allowedIds.has(itemId)) {
      throw new ConflictException('Authorized root folders cannot be moved.');
    }

    await this.assertItemAllowed(drive, itemId, allowedIds);
    await this.assertItemAllowed(drive, targetFolderId, allowedIds);

    const meta = await drive.files.get({ fileId: itemId, fields: 'parents' });
    const previousParents = (meta.data.parents ?? []).join(',');

    const res = await drive.files.update({
      fileId: itemId,
      addParents: targetFolderId,
      removeParents: previousParents,
      fields: 'id, name, mimeType, size, modifiedTime, iconLink, webViewLink',
    });

    this.logger.log(`Moved item ${itemId} into ${targetFolderId}.`);

    return this.toDriveEntry(res.data);
  }

  async downloadFile(fileId: string): Promise<StorageDownload> {
    const driveAccountId = await this.googleAuthService.getActiveAccountId();
    const drive = await this.getDrive(driveAccountId);
    const allowedIds = await this.getAllowedFolderIds(driveAccountId);

    await this.assertItemAllowed(drive, fileId, allowedIds);

    const meta = await drive.files.get({ fileId, fields: 'name, mimeType, size' });
    const name = meta.data.name ?? 'download';
    const mimeType = meta.data.mimeType ?? 'application/octet-stream';
    const size = this.parseSize(meta.data.size);

    if (mimeType === FOLDER_MIME) {
      throw new BadRequestException('Use the folder download endpoint for folders.');
    }

    const res = await drive.files.get(
      { fileId, alt: 'media' },
      // Uncompressed so the byte length matches the reported size (accurate Content-Length).
      { responseType: 'stream', headers: { 'Accept-Encoding': 'identity' } },
    );

    return { stream: res.data as unknown as Readable, name, mimeType, size };
  }

  /**
   * Builds a ZIP of a folder's subtree, populated in the background as it's piped out.
   **/
  async createFolderArchive(folderId: string): Promise<StorageArchive> {
    const driveAccountId = await this.googleAuthService.getActiveAccountId();
    const drive = await this.getDrive(driveAccountId);
    const allowedIds = await this.getAllowedFolderIds(driveAccountId);

    if (allowedIds.has(folderId)) {
      throw new BadRequestException('Authorized root folders cannot be downloaded as a ZIP.');
    }

    await this.assertItemAllowed(drive, folderId, allowedIds);

    const meta = await drive.files.get({ fileId: folderId, fields: 'name, mimeType' });

    if (meta.data.mimeType !== FOLDER_MIME) {
      throw new BadRequestException('Not a folder.');
    }

    const name = meta.data.name ?? 'folder';
    const archive = new ZipArchive({ zlib: { level: 9 } });

    finalizeArchiveInBackground(archive, this.appendFolderToArchive(drive, folderId, '', archive));

    return { archive, name };
  }

  /**
   * Recursively appends a folder's files and subfolders into the archive.
   **/
  private async appendFolderToArchive(
    drive: drive_v3.Drive,
    folderId: string,
    prefix: string,
    archive: Archiver,
  ): Promise<void> {
    let pageToken: string | undefined;

    do {
      const res = await drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: 'nextPageToken, files(id, name, mimeType)',
        orderBy: 'folder,name',
        pageSize: 1000,
        pageToken,
      });

      for (const file of res.data.files ?? []) {
        if (!file.id || !file.name) {
          continue;
        }

        const entryPath = prefix ? `${prefix}/${file.name}` : file.name;

        if (file.mimeType === FOLDER_MIME) {
          await this.appendFolderToArchive(drive, file.id, entryPath, archive);
        } else {
          const media = await drive.files.get(
            { fileId: file.id, alt: 'media' },
            { responseType: 'stream' },
          );
          archive.append(media.data as unknown as Readable, {
            name: sanitizeZipEntryPath(entryPath),
          });
        }
      }

      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);
  }

  private toDriveEntry(file: drive_v3.Schema$File): DriveEntryEntity {
    const isFolder = file.mimeType === FOLDER_MIME;

    return {
      id: file.id ?? '',
      name: file.name ?? '',
      mimeType: file.mimeType ?? '',
      isFolder,
      size: isFolder ? null : this.parseSize(file.size),
      modifiedTime: file.modifiedTime ?? null,
      iconLink: file.iconLink ?? null,
      webViewLink: file.webViewLink ?? null,
    };
  }

  private parseSize(size: string | null | undefined): number | null {
    if (size === null || size === undefined) {
      return null;
    }

    const parsed = Number(size);

    return Number.isNaN(parsed) ? null : parsed;
  }
}
