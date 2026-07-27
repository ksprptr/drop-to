'use server';

import type { DriveEntry, StorageBackend, StorageStatus } from '@dropto/types';

import {
  createSubfolder,
  deleteItem,
  getStatuses,
  listContents,
  moveItem,
  renameItem,
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
 * Deletes a file or folder.
 **/
export async function deleteItemAction(
  backend: StorageBackend,
  id: string,
): Promise<ActionResult> {
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
