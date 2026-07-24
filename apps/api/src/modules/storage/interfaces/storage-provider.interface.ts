import { Archiver } from 'archiver';
import { Readable } from 'node:stream';

import { AllowedFolderEntity } from '@/modules/google-auth/entities/allowed-folder.entity';

import { DriveEntryEntity } from '../entities/drive-entry.entity';
import { StorageStatusEntity } from '../entities/storage-status.entity';
import { UploadResultEntity } from '../entities/upload-result.entity';

/** The storage backends the workspace can browse. */
export type StorageBackend = 'drive' | 's3';

/** All known backend keys, in the order they appear in the sidebar. */
export const STORAGE_BACKENDS: StorageBackend[] = ['drive', 's3'];

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
  archive: Archiver;
  name: string;
}

/**
 * Backend-agnostic contract for a file storage backend.
 *
 * Implemented by `GoogleDriveProvider` (Google Drive) and `S3StorageProvider`
 * (AWS S3 / S3-compatible). Every method is expressed in terms the app cares
 * about (browse roots, folder contents, uploads, downloads) rather than backend
 * specifics, so a new backend only needs to implement this interface and be
 * registered in the `StorageRegistry`. Implementations must keep enforcing their
 * allowed scope — no id from a request is ever trusted unvalidated.
 */
export interface StorageProvider {
  /** The backend key this provider serves ('drive' | 's3'). */
  readonly backend: StorageBackend;

  /**
   * Reports whether the backend is usable and its browse roots, for the sidebar
   * and storage switcher. Never throws for a not-connected backend — it returns
   * `connected: false` with empty roots.
   */
  status(): Promise<StorageStatusEntity>;

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
