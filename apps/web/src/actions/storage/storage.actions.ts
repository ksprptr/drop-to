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
 * Server Action: fetches the status of every storage backend.
 * @returns The per-backend status list
 */
export async function statusesAction(): Promise<ActionResult<StorageStatus[]>> {
  return runAction(() => getStatuses());
}

/**
 * Server Action: lists the contents of a folder.
 * @param backend - The storage backend
 * @param folderId - The folder id
 * @returns The folder entries
 */
export async function listContentsAction(
  backend: StorageBackend,
  folderId: string,
): Promise<ActionResult<DriveEntry[]>> {
  return runAction(() => listContents(backend, folderId));
}

/**
 * Server Action: creates a subfolder inside a folder.
 * @param backend - The storage backend
 * @param parentId - The parent folder id
 * @param name - The new folder name
 * @returns The created folder entry
 */
export async function createFolderAction(
  backend: StorageBackend,
  parentId: string,
  name: string,
): Promise<ActionResult<DriveEntry>> {
  return runAction(() => createSubfolder(backend, parentId, name));
}

/**
 * Server Action: deletes a file or folder.
 * @param backend - The storage backend
 * @param id - The file or folder id
 * @returns The result of the delete
 */
export async function deleteItemAction(
  backend: StorageBackend,
  id: string,
): Promise<ActionResult> {
  return runAction(() => deleteItem(backend, id));
}

/**
 * Server Action: renames a file or folder.
 * @param backend - The storage backend
 * @param id - The file or folder id
 * @param name - The new name
 * @returns The renamed entry
 */
export async function renameItemAction(
  backend: StorageBackend,
  id: string,
  name: string,
): Promise<ActionResult<DriveEntry>> {
  return runAction(() => renameItem(backend, id, name));
}

/**
 * Server Action: moves a file or folder into another folder.
 * @param backend - The storage backend
 * @param id - The file or folder id to move
 * @param targetFolderId - The destination folder id
 * @returns The moved entry
 */
export async function moveItemAction(
  backend: StorageBackend,
  id: string,
  targetFolderId: string,
): Promise<ActionResult<DriveEntry>> {
  return runAction(() => moveItem(backend, id, targetFolderId));
}
