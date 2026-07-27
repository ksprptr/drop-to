import 'server-only';
import type { DriveEntry, StorageBackend, StorageStatus } from '@dropto/types';

import { getHttp } from '@/common/services/axios/axios.instance';
import { seg } from '@/common/utils/storage-path';

// Server-side storage API via getHttp(); uploads/downloads use dedicated route handlers.

/**
 * Fetches the status of every storage backend (Drive + S3).
 **/
export const getStatuses = async (): Promise<StorageStatus[]> => {
  const http = await getHttp();
  const { data } = await http.get<StorageStatus[]>('/storage/status');

  return data;
};

/**
 * Lists the contents (files + folders) of a folder.
 **/
export const listContents = async (
  backend: StorageBackend,
  folderId: string,
): Promise<DriveEntry[]> => {
  const http = await getHttp();
  const { data } = await http.get<DriveEntry[]>(
    `/storage/${backend}/folders/${seg(folderId)}/contents`,
  );

  return data;
};

/**
 * Creates a subfolder inside a folder.
 **/
export const createSubfolder = async (
  backend: StorageBackend,
  parentId: string,
  name: string,
): Promise<DriveEntry> => {
  const http = await getHttp();
  const { data } = await http.post<DriveEntry>(
    `/storage/${backend}/folders/${seg(parentId)}/subfolder`,
    { name },
  );

  return data;
};

/**
 * Deletes a file or folder.
 **/
export const deleteItem = async (backend: StorageBackend, id: string): Promise<void> => {
  const http = await getHttp();
  await http.delete(`/storage/${backend}/files/${seg(id)}`);
};

/**
 * Renames a file or folder.
 **/
export const renameItem = async (
  backend: StorageBackend,
  id: string,
  name: string,
): Promise<DriveEntry> => {
  const http = await getHttp();
  const { data } = await http.patch<DriveEntry>(`/storage/${backend}/files/${seg(id)}/rename`, {
    name,
  });

  return data;
};

/**
 * Moves a file or folder into another folder.
 **/
export const moveItem = async (
  backend: StorageBackend,
  id: string,
  targetFolderId: string,
): Promise<DriveEntry> => {
  const http = await getHttp();
  const { data } = await http.patch<DriveEntry>(`/storage/${backend}/files/${seg(id)}/move`, {
    targetFolderId,
  });

  return data;
};
