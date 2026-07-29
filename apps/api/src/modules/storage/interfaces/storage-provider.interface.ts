import { Archiver } from 'archiver';
import { Readable } from 'node:stream';

import { AllowedFolderEntity } from '@/modules/google-auth/entities/allowed-folder.entity';

import { DriveEntryEntity } from '../entities/drive-entry.entity';
import { ResolvedNameEntity } from '../entities/resolved-name.entity';
import { StorageStatusEntity } from '../entities/storage-status.entity';
import { UploadResultEntity } from '../entities/upload-result.entity';

/** The storage backends the workspace can browse. */
export type StorageBackend = 'drive' | 's3';

/** All known backend keys, in the order they appear in the sidebar. */
export const STORAGE_BACKENDS: StorageBackend[] = ['drive', 's3'];

/** A file to upload: stream + metadata; `signal` aborts an in-flight upload. */
export interface StorageUpload {
  body: Readable;
  fileName: string;
  mimeType: string;
  signal?: AbortSignal;
}

/** Metadata to open a resumable upload session (the browser then streams the bytes straight to storage). */
export interface ResumableUploadInit {
  name: string;
  mimeType: string;
  size: number;
  /** Browser origin, so the created session permits a cross-origin PUT from the web app. */
  origin: string;
}

/** A file opened for download: stream + headers (`size` null when unreported). */
export interface StorageDownload {
  stream: Readable;
  name: string;
  mimeType: string;
  size: number | null;
}

/** A folder streamed as a ZIP archive plus the folder name for the file name. */
export interface StorageArchive {
  archive: Archiver;
  name: string;
}

// Backend-agnostic storage contract. Implementations must enforce their allowed scope (no id trusted unvalidated).
export interface StorageProvider {
  /** The backend key this provider serves ('drive' | 's3'). */
  readonly backend: StorageBackend;

  /** Backend usability + browse roots for the sidebar; never throws (returns `connected: false`). */
  status(): Promise<StorageStatusEntity>;

  /** Lists the authorized root folders (the ones picked during setup). */
  listRoots(): Promise<AllowedFolderEntity[]>;

  /** Lists the files and subfolders directly inside an authorized folder. */
  listContents(folderId: string): Promise<DriveEntryEntity[]>;

  /** Resolves the display names of ids (for rebuilding a breadcrumb from a deep link). */
  resolveNames(ids: string[]): Promise<ResolvedNameEntity[]>;

  /** Creates a subfolder inside an authorized folder. */
  createFolder(parentId: string, name: string): Promise<DriveEntryEntity>;

  /** Uploads a file into an authorized folder (server-streamed; used by S3 and as the small-file path). */
  uploadFile(folderId: string, upload: StorageUpload): Promise<UploadResultEntity>;

  /**
   * Opens a resumable upload session into an authorized folder and returns the session URL the browser
   * PUTs the bytes to directly (never through the app server / CDN). The access token stays server-side.
   */
  createResumableUpload(folderId: string, init: ResumableUploadInit): Promise<{ uploadUrl: string }>;

  /** Validates + records a resumable upload once the browser finished it; returns the stored file. */
  finalizeUpload(fileId: string): Promise<UploadResultEntity>;

  /** Deletes a file or subfolder inside the authorized tree (never a root). */
  deleteItem(itemId: string): Promise<void>;

  /** Renames a file or subfolder inside the authorized scope (never a root). */
  renameItem(itemId: string, name: string): Promise<DriveEntryEntity>;

  /** Moves an item into another folder inside the authorized scope (never a root itself). */
  moveItem(itemId: string, targetFolderId: string): Promise<DriveEntryEntity>;

  /** Opens a readable stream of a single file's contents. */
  downloadFile(fileId: string): Promise<StorageDownload>;

  /** Builds a ZIP archive of a folder's entire subtree. */
  createFolderArchive(folderId: string): Promise<StorageArchive>;
}
