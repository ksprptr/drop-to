import archiver from 'archiver';
import { Readable } from 'node:stream';

import { AllowedFolderEntity } from '@/modules/google-auth/entities/allowed-folder.entity';

import { DriveEntryEntity } from '../entities/drive-entry.entity';
import { UploadResultEntity } from '../entities/upload-result.entity';

/**
 * DI token the storage provider is bound to. Controllers depend on the
 * `StorageProvider` interface via this token, never on a concrete backend, so a
 * different backend (e.g. S3) is a one-line binding change in `StorageModule`.
 */
export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');

/**
 * A file to upload: its contents as a stream plus the metadata needed to store
 * it. `signal` lets the caller abort an in-flight upload (client disconnect).
 */
export interface StorageUpload {
  body: Readable;
  fileName: string;
  mimeType: string;
  signal?: AbortSignal;
}

/**
 * A file opened for download: the content stream plus the headers a caller needs
 * (`size` may be null when the backend does not report it).
 */
export interface StorageDownload {
  stream: Readable;
  name: string;
  mimeType: string;
  size: number | null;
}

/**
 * A folder streamed as a ZIP archive plus the folder name for the file name.
 */
export interface StorageArchive {
  archive: archiver.Archiver;
  name: string;
}

/**
 * Backend-agnostic contract for the file storage a `DriveAccount` is backed by.
 *
 * The current implementation ({@link GoogleDriveProvider}) is Google Drive, but
 * every method is expressed in terms the app cares about (authorized roots,
 * folder contents, uploads, downloads) rather than Drive specifics, so an
 * alternative backend (e.g. S3) only needs to implement this interface and be
 * bound to {@link STORAGE_PROVIDER}. Implementations must keep enforcing the
 * authorized-folder tree — no id from a request is ever trusted unvalidated.
 */
export interface StorageProvider {
  /** Lists the authorized root folders (the ones picked during setup). */
  listRoots(): Promise<AllowedFolderEntity[]>;

  /** Lists the files and subfolders directly inside an authorized folder. */
  listContents(folderId: string): Promise<DriveEntryEntity[]>;

  /** Creates a subfolder inside an authorized folder. */
  createFolder(parentId: string, name: string): Promise<DriveEntryEntity>;

  /** Uploads a file into an authorized folder. */
  uploadFile(folderId: string, upload: StorageUpload): Promise<UploadResultEntity>;

  /** Deletes a file or subfolder inside the authorized tree (never a root). */
  deleteItem(itemId: string): Promise<void>;

  /** Opens a readable stream of a single file's contents. */
  downloadFile(fileId: string): Promise<StorageDownload>;

  /** Builds a ZIP archive of a folder's entire subtree. */
  createFolderArchive(folderId: string): Promise<StorageArchive>;
}
