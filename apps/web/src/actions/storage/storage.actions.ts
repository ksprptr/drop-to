'use server';

import type {
  DriveEntry,
  ResumableUploadSession,
  StorageBackend,
  StorageStatus,
  UploadResult,
} from '@dropto/types';

import {
  createSubfolder,
  createUploadSession,
  deleteItem,
  finalizeUpload,
  getStatuses,
  listContents,
  moveItem,
  renameItem,
  resolveNames,
} from '@/common/services/api/storage.api';
import { type ActionResult, runAction } from '@/common/utils/action.functions';

/**
 * Fetches the status of every storage backend.
 **/
export async function statusesAction(): Promise<ActionResult<StorageStatus[]>> {
  return runAction(() => getStatuses());
}

/**
 * Lists the contents of a folder.
 **/
export async function listContentsAction(
  backend: StorageBackend,
  folderId: string,
): Promise<ActionResult<DriveEntry[]>> {
  return runAction(() => listContents(backend, folderId));
}

/**
 * Resolves display names for a set of ids (rebuilding a breadcrumb from a deep link).
 **/
export async function resolvePathAction(
  backend: StorageBackend,
  ids: string[],
): Promise<ActionResult<{ id: string; name: string }[]>> {
  return runAction(() => resolveNames(backend, ids));
}

/**
 * Creates a subfolder inside a folder.
 **/
export async function createFolderAction(
  backend: StorageBackend,
  parentId: string,
  name: string,
): Promise<ActionResult<DriveEntry>> {
  return runAction(() => createSubfolder(backend, parentId, name));
}

/**
 * Opens a resumable upload session (browser streams the file straight to storage).
 **/
export async function createUploadSessionAction(
  backend: StorageBackend,
  folderId: string,
  meta: { name: string; mimeType: string; size: number },
): Promise<ActionResult<ResumableUploadSession>> {
  return runAction(() => createUploadSession(backend, folderId, meta));
}

/**
 * Validates + records a browser-completed resumable upload.
 **/
export async function finalizeUploadAction(
  backend: StorageBackend,
  fileId: string,
): Promise<ActionResult<UploadResult>> {
  return runAction(() => finalizeUpload(backend, fileId));
}

/**
 * Deletes a file or folder.
 **/
export async function deleteItemAction(backend: StorageBackend, id: string): Promise<ActionResult> {
  return runAction(() => deleteItem(backend, id));
}

/**
 * Renames a file or folder.
 **/
export async function renameItemAction(
  backend: StorageBackend,
  id: string,
  name: string,
): Promise<ActionResult<DriveEntry>> {
  return runAction(() => renameItem(backend, id, name));
}

/**
 * Moves a file or folder into another folder.
 **/
export async function moveItemAction(
  backend: StorageBackend,
  id: string,
  targetFolderId: string,
): Promise<ActionResult<DriveEntry>> {
  return runAction(() => moveItem(backend, id, targetFolderId));
}
