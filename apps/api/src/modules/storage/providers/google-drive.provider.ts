/* eslint-disable no-await-in-loop */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
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

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const MAX_ANCESTOR_DEPTH = 50;

/**
 * Google Drive implementation of {@link StorageProvider}.
 *
 * Wraps the Google Drive API and enforces that every operation stays within the
 * tree of `AllowedFolder`s the account owner authorized via the Picker. No raw
 * folder id from a request is ever trusted without validation. It is one of the
 * backends registered in the `StorageRegistry`; the controller never touches a
 * concrete provider.
 */
@Injectable()
export class GoogleDriveProvider implements StorageProvider {
  readonly backend: StorageBackend = 'drive';

  private readonly logger = new Logger(GoogleDriveProvider.name);

  constructor(
    private readonly googleAuthService: GoogleAuthService,
    private readonly prismaService: PrismaService,
  ) {}

  /**
   * Function to report the Drive connection status and authorized roots.
   * @returns The backend status with the authorized folders as roots
   */
  async status(): Promise<StorageStatusEntity> {
    const status = await this.googleAuthService.getStatus();

    if (!status.connected) {
      return { backend: this.backend, label: 'Google Drive', connected: false, email: null, roots: [] };
    }

    // A stored account can still carry a dead refresh token (revoked, or expired
    // in Google's Testing mode). Probe it so the sidebar shows a "reconnect"
    // prompt instead of a green "connected" that fails on the first click.
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

  /**
   * Function to build an authorized Drive v3 client for the active account.
   * @param driveAccountId - The active DriveAccount id
   * @returns A Drive API client
   */
  private async getDrive(driveAccountId: string): Promise<drive_v3.Drive> {
    const auth = await this.googleAuthService.getAuthorizedClient(driveAccountId);

    // Force the access-token refresh up front so a revoked/expired refresh token
    // surfaces as a clean "reconnect" error (424) instead of a raw googleapis 500
    // on the first Drive call.
    try {
      await auth.getAccessToken();
    } catch (error) {
      if (isInvalidGrant(error)) {
        throw new StorageDisconnectedException(DRIVE_DISCONNECTED_MESSAGE);
      }
      throw error;
    }

    return google.drive({ version: 'v3', auth });
  }

  /**
   * Function to load the set of authorized root folder ids for an account.
   * @param driveAccountId - The active DriveAccount id
   * @returns A set of allowed Google Drive folder ids
   */
  private async getAllowedFolderIds(driveAccountId: string): Promise<Set<string>> {
    const folders = await this.prismaService.allowedFolder.findMany({
      where: { driveAccountId },
      select: { folderId: true },
    });

    return new Set(folders.map((folder) => folder.folderId));
  }

  /**
   * Function to assert that a Drive item lives inside the allowed folder tree.
   *
   * Passes when the id is an authorized root folder, or when any of its
   * ancestors (walked up via `files.get`) is an authorized root. Throws
   * `ForbiddenException` otherwise.
   * @param drive - The Drive client
   * @param itemId - The file/folder id from the request
   * @param allowedIds - The set of authorized root folder ids
   */
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
          // The app cannot see this item (drive.file scope) — treat as not allowed.
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

  /**
   * Function to list the authorized root folders from the database.
   * @returns The allowed root folders
   */
  async listRoots(): Promise<AllowedFolderEntity[]> {
    const driveAccountId = await this.googleAuthService.getActiveAccountId();

    return this.prismaService.allowedFolder.findMany({
      where: { driveAccountId },
      select: { id: true, folderId: true, name: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Function to list the contents (files + folders) of an authorized folder.
   * @param folderId - The Google Drive folder id
   * @returns The folder entries, folders first
   */
  async listContents(folderId: string): Promise<DriveEntryEntity[]> {
    const driveAccountId = await this.googleAuthService.getActiveAccountId();
    const drive = await this.getDrive(driveAccountId);
    const allowedIds = await this.getAllowedFolderIds(driveAccountId);

    await this.assertItemAllowed(drive, folderId, allowedIds);

    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'files(id, name, mimeType, size, modifiedTime, iconLink, webViewLink)',
      orderBy: 'folder,name',
      pageSize: 1000,
    });

    return (res.data.files ?? []).map((file) => this.toDriveEntry(file));
  }

  /**
   * Function to create a subfolder inside an authorized folder.
   * @param parentId - The parent folder id (must be within the allowed tree)
   * @param name - The new folder name
   * @returns The created folder as a Drive entry
   */
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

  /**
   * Function to upload a file into an authorized folder.
   * @param folderId - The destination folder id (must be within the allowed tree)
   * @param upload - The file contents stream plus its name, MIME type and abort signal
   * @returns The upload result
   */
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
    }
  }

  /**
   * Function to delete a file or subfolder that lives within the authorized tree.
   *
   * Authorized root folders (the ones picked during setup) cannot be deleted —
   * removing them would break the app's access grant.
   * @param itemId - The Google Drive file or folder id
   */
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
   * Function to open a readable stream of a file's contents for download.
   * @param fileId - The Google Drive file id (must be within the allowed tree)
   * @returns The content stream plus the file name and MIME type
   */
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
      // Force an uncompressed stream so its byte length matches the reported size
      // (a correct Content-Length is what lets the browser show real progress).
      { responseType: 'stream', headers: { 'Accept-Encoding': 'identity' } },
    );

    return { stream: res.data as unknown as Readable, name, mimeType, size };
  }

  /**
   * Function to build a ZIP archive of a folder's entire subtree.
   *
   * The archive is populated in the background as it is consumed; the caller
   * pipes it straight to the HTTP response.
   * @param folderId - The Google Drive folder id (must be within the allowed tree)
   * @returns The archive stream and the folder name
   */
  async createFolderArchive(folderId: string): Promise<StorageArchive> {
    const driveAccountId = await this.googleAuthService.getActiveAccountId();
    const drive = await this.getDrive(driveAccountId);
    const allowedIds = await this.getAllowedFolderIds(driveAccountId);

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
   * Function to recursively append a folder's files (and subfolders) into an archive.
   * @param drive - The Drive client
   * @param folderId - The folder to walk
   * @param prefix - The path prefix inside the archive
   * @param archive - The archive to append entries to
   */
  private async appendFolderToArchive(
    drive: drive_v3.Drive,
    folderId: string,
    prefix: string,
    archive: Archiver,
  ): Promise<void> {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'files(id, name, mimeType)',
      orderBy: 'folder,name',
      pageSize: 1000,
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
        archive.append(media.data as unknown as Readable, { name: entryPath });
      }
    }
  }

  /**
   * Function to map a Drive API file resource onto a DriveEntryEntity.
   * @param file - The Drive API file resource
   * @returns The normalized entry
   */
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

  /**
   * Function to parse a Drive size string into a number.
   * @param size - The size string (or null/undefined)
   * @returns The numeric size, or null when absent
   */
  private parseSize(size: string | null | undefined): number | null {
    if (size === null || size === undefined) {
      return null;
    }

    const parsed = Number(size);

    return Number.isNaN(parsed) ? null : parsed;
  }
}
