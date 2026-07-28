/* eslint-disable no-await-in-loop */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Archiver, ZipArchive } from 'archiver';
import { drive_v3, google } from 'googleapis';
import { Readable } from 'node:stream';

import { AllowedFolderEntity } from '@/modules/google-auth/entities/allowed-folder.entity';
import { GoogleAuthService } from '@/modules/google-auth/google-auth.service';
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
  DRIVE_DISCONNECTED_MESSAGE,
  isInvalidGrant,
  StorageDisconnectedException,
} from '../storage.errors';
import { sanitizeZipEntryPath } from '../storage.functions';

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const MAX_ANCESTOR_DEPTH = 50;

/**
 * StorageProvider over the Drive API; every op is validated to stay inside the authorized folder tree.
 **/
@Injectable()
export class GoogleDriveProvider implements StorageProvider {
  readonly backend: StorageBackend = 'drive';

  private readonly logger = new Logger(GoogleDriveProvider.name);

  constructor(
    private readonly googleAuthService: GoogleAuthService,
    private readonly prismaService: PrismaService,
  ) {}

  async status(): Promise<StorageStatusEntity> {
    const status = await this.googleAuthService.getStatus();

    if (!status.connected) {
      return { backend: this.backend, label: 'Google Drive', connected: false, email: null, roots: [] };
    }

    // Probe the token so a dead one shows "reconnect" instead of a false "connected".
    try {
      const accountId = await this.googleAuthService.getActiveAccountId();
      const auth = await this.googleAuthService.getAuthorizedClient(accountId);
      await auth.getAccessToken();
    } catch (error) {
      if (isInvalidGrant(error)) {
        return {
          backend: this.backend,
          label: 'Google Drive',
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
      label: 'Google Drive',
      connected: true,
      email: status.email,
      roots: status.allowedFolders.map((folder) => ({ id: folder.folderId, name: folder.name })),
    };
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
   * Passes if the id is an authorized root or has one as an ancestor; else 403.
   **/
  private async assertItemAllowed(
    drive: drive_v3.Drive,
    itemId: string,
    allowedIds: Set<string>,
  ): Promise<void> {
    if (allowedIds.has(itemId)) {
      return;
    }

    const visited = new Set<string>();
    let frontier = [itemId];
    let depth = 0;

    while (frontier.length > 0 && depth < MAX_ANCESTOR_DEPTH) {
      const next: string[] = [];

      for (const id of frontier) {
        if (visited.has(id)) {
          continue;
        }
        visited.add(id);

        let parents: string[];

        try {
          const res = await drive.files.get({ fileId: id, fields: 'id, parents' });
          parents = res.data.parents ?? [];
        } catch {
          // Not visible under drive.file scope — treat as not allowed.
          continue;
        }

        for (const parent of parents) {
          if (allowedIds.has(parent)) {
            return;
          }
          next.push(parent);
        }
      }

      frontier = next;
      depth += 1;
    }

    throw new ForbiddenException('This folder is outside the authorized folders.');
  }

  async listRoots(): Promise<AllowedFolderEntity[]> {
    const driveAccountId = await this.googleAuthService.getActiveAccountId();

    return this.prismaService.allowedFolder.findMany({
      where: { driveAccountId },
      select: { id: true, folderId: true, name: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async listContents(folderId: string): Promise<DriveEntryEntity[]> {
    const driveAccountId = await this.googleAuthService.getActiveAccountId();
    const drive = await this.getDrive(driveAccountId);
    const allowedIds = await this.getAllowedFolderIds(driveAccountId);

    await this.assertItemAllowed(drive, folderId, allowedIds);

    const files: drive_v3.Schema$File[] = [];
    let pageToken: string | undefined;

    do {
      const res = await drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: 'nextPageToken, files(id, name, mimeType, size, modifiedTime, iconLink, webViewLink)',
        orderBy: 'folder,name',
        pageSize: 1000,
        pageToken,
      });

      files.push(...(res.data.files ?? []));
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);

    return files.map((file) => this.toDriveEntry(file));
  }

  async resolveNames(ids: string[]): Promise<Array<{ id: string; name: string }>> {
    const driveAccountId = await this.googleAuthService.getActiveAccountId();
    const drive = await this.getDrive(driveAccountId);

    // Breadcrumb names only — one parallel files.get per id, no ancestor walk (data access still validates the full tree).
    return Promise.all(
      ids.map(async (id) => {
        try {
          const res = await drive.files.get({ fileId: id, fields: 'id, name' });
          return { id, name: res.data.name ?? '' };
        } catch {
          return { id, name: '' };
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

    try {
      const res = await drive.files.create(
        {
          requestBody: { name: fileName, parents: [folderId] },
          media: { mimeType, body },
          fields: 'id, name, size, webViewLink',
        },
        { signal },
      );

      const size = this.parseSize(res.data.size);

      await this.prismaService.uploadLog.create({
        data: {
          fileName,
          folderId,
          fileId: res.data.id,
          size: size === null ? null : BigInt(size),
          status: 'SUCCESS',
        },
      });

      this.logger.log(`Uploaded "${fileName}" (${res.data.id}) into ${folderId}.`);

      return {
        fileId: res.data.id ?? '',
        fileName: res.data.name ?? fileName,
        size,
        webViewLink: res.data.webViewLink ?? null,
      };
    } catch (error) {
      // A client-cancelled upload isn't a real failure — don't log it.
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
    }
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

    void this.appendFolderToArchive(drive, folderId, '', archive).then(
      () => archive.finalize(),
      (error: unknown) =>
        archive.destroy(error instanceof Error ? error : new Error(String(error))),
    );

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
