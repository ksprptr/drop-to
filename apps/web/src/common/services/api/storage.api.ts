import 'server-only';
import type { DriveEntry, StorageBackend, StorageStatus } from '@dropto/types';

import { getHttp } from '@/common/services/axios/axios.instance';

/**
 * Server-side API functions for the storage backends. All reached through
 * `getHttp()` (server-to-server, cookies forwarded). File uploads and downloads
 * are handled by dedicated Route Handlers (streaming), not here.
 */

/**
 * Fetches the status of every storage backend (Drive + S3).
 * @returns The per-backend status list
 */
export const getStatuses = async (): Promise<StorageStatus[]> => {
  const http = await getHttp();
  const { data } = await http.get<StorageStatus[]>('/storage/status');

  return data;
};

/**
 * Lists the contents (files + folders) of a folder.
 * @param backend - The storage backend
 * @param folderId - The folder id
 * @returns The folder entries (folders first)
 */
export const listContents = async (
  backend: StorageBackend,
  folderId: string,
): Promise<DriveEntry[]> => {
  const http = await getHttp();
  const { data } = await http.get<DriveEntry[]>(
    `/storage/${backend}/folders/${folderId}/contents`,
  );

  return data;
};

/**
 * Creates a subfolder inside a folder.
 * @param backend - The storage backend
 * @param parentId - The parent folder id
 * @param name - The new folder name
 * @returns The created folder entry
 */
export const createSubfolder = async (
  backend: StorageBackend,
  parentId: string,
  name: string,
): Promise<DriveEntry> => {
  const http = await getHttp();
  const { data } = await http.post<DriveEntry>(
    `/storage/${backend}/folders/${parentId}/subfolder`,
    { name },
  );

  return data;
};

/**
 * Deletes a file or folder.
 * @param backend - The storage backend
 * @param id - The file or folder id
 */
export const deleteItem = async (backend: StorageBackend, id: string): Promise<void> => {
  const http = await getHttp();
  await http.delete(`/storage/${backend}/files/${id}`);
};

/**
 * Renames a file or folder.
 * @param backend - The storage backend
 * @param id - The file or folder id
 * @param name - The new name
 * @returns The renamed entry
 */
export const renameItem = async (
  backend: StorageBackend,
  id: string,
  name: string,
): Promise<DriveEntry> => {
  const http = await getHttp();
  const { data } = await http.patch<DriveEntry>(`/storage/${backend}/files/${id}/rename`, { name });

  return data;
};

/**
 * Moves a file or folder into another folder.
 * @param backend - The storage backend
 * @param id - The file or folder id to move
 * @param targetFolderId - The destination folder id
 * @returns The moved entry
 */
export const moveItem = async (
  backend: StorageBackend,
  id: string,
  targetFolderId: string,
): Promise<DriveEntry> => {
  const http = await getHttp();
  const { data } = await http.patch<DriveEntry>(`/storage/${backend}/files/${id}/move`, {
    targetFolderId,
  });

  return data;
};
