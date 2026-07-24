import type { DriveEntry, StorageBackend, StorageStatus, UploadResult } from '@dropto/types';
import type { AxiosProgressEvent } from 'axios';

import { http } from '@/common/services/axios/axios.instance';
import { getEnvString } from '@/common/utils/environments.functions';

/**
 * Returns the API base URL without a trailing slash.
 */
const apiBase = (): string =>
  getEnvString({ key: 'NEXT_PUBLIC_API_URL', fallback: 'http://localhost:4000/api/v1' }).replace(
    /\/$/,
    '',
  );

/**
 * Function to fetch the status of every storage backend (Drive + S3).
 * @returns The per-backend status list
 */
export const getStorageStatuses = async (): Promise<StorageStatus[]> => {
  const { data } = await http.get<StorageStatus[]>('/storage/status');

  return data;
};

/**
 * Builds the absolute URL that streams a file download (cookie-authenticated).
 * @param backend - The storage backend
 * @param id - The file id
 * @returns The download URL
 */
export const fileDownloadUrl = (backend: StorageBackend, id: string): string =>
  `${apiBase()}/storage/${backend}/files/${id}/download`;

/**
 * Builds the absolute URL that streams a folder as a ZIP (cookie-authenticated).
 * @param backend - The storage backend
 * @param id - The folder id
 * @returns The ZIP download URL
 */
export const folderDownloadUrl = (backend: StorageBackend, id: string): string =>
  `${apiBase()}/storage/${backend}/folders/${id}/download`;

/**
 * Function to list the contents of a folder.
 * @param backend - The storage backend
 * @param folderId - The folder id
 * @returns The folder entries (folders first)
 */
export const getFolderContents = async (
  backend: StorageBackend,
  folderId: string,
): Promise<DriveEntry[]> => {
  const { data } = await http.get<DriveEntry[]>(`/storage/${backend}/folders/${folderId}/contents`);

  return data;
};

/**
 * Function to create a subfolder inside a folder.
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
  const { data } = await http.post<DriveEntry>(`/storage/${backend}/folders/${parentId}/subfolder`, {
    name,
  });

  return data;
};

/** Upload progress reported to the caller. */
export interface UploadProgress {
  percent: number;
  /** Transfer rate in bytes/sec (null when unknown). */
  rate: number | null;
}

/**
 * Function to upload a file into a folder, reporting progress.
 * @param backend - The storage backend
 * @param folderId - The destination folder id
 * @param file - The file to upload
 * @param onProgress - Callback receiving the 0–100 progress percentage
 * @param signal - Abort signal to cancel the upload
 * @param name - Optional override for the uploaded file name
 * @returns The upload result
 */
export const uploadFile = async (
  backend: StorageBackend,
  folderId: string,
  file: File,
  onProgress?: (progress: UploadProgress) => void,
  signal?: AbortSignal,
  name?: string,
): Promise<UploadResult> => {
  const formData = new FormData();
  // The multipart filename becomes the stored file name — override it when renaming.
  formData.append('file', file, name ?? file.name);

  const { data } = await http.post<UploadResult>(
    `/storage/${backend}/folders/${folderId}/upload`,
    formData,
    {
      signal,
      onUploadProgress: (event: AxiosProgressEvent) => {
        if (onProgress && event.total) {
          onProgress({
            percent: Math.round((event.loaded / event.total) * 100),
            rate: typeof event.rate === 'number' && Number.isFinite(event.rate) ? event.rate : null,
          });
        }
      },
    },
  );

  return data;
};

/**
 * Function to delete a file or folder.
 * @param backend - The storage backend
 * @param id - The file or folder id
 */
export const deleteItem = async (backend: StorageBackend, id: string): Promise<void> => {
  await http.delete(`/storage/${backend}/files/${id}`);
};

/**
 * Function to rename a file or folder.
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
  const { data } = await http.patch<DriveEntry>(`/storage/${backend}/files/${id}/rename`, { name });

  return data;
};

/**
 * Function to move a file or folder into another folder.
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
  const { data } = await http.patch<DriveEntry>(`/storage/${backend}/files/${id}/move`, {
    targetFolderId,
  });

  return data;
};
