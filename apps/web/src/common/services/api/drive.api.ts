import type { AllowedFolder, DriveEntry, UploadResult } from '@dropto/types';
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
 * Builds the absolute URL that streams a file download (cookie-authenticated).
 * @param fileId - The Google Drive file id
 * @returns The download URL
 */
export const fileDownloadUrl = (fileId: string): string =>
  `${apiBase()}/drive/files/${fileId}/download`;

/**
 * Builds the absolute URL that streams a folder as a ZIP (cookie-authenticated).
 * @param folderId - The Google Drive folder id
 * @returns The ZIP download URL
 */
export const folderDownloadUrl = (folderId: string): string =>
  `${apiBase()}/drive/folders/${folderId}/download`;

/**
 * Function to fetch the authorized root folders.
 * @returns The allowed root folders
 */
export const getAllowedFolders = async (): Promise<AllowedFolder[]> => {
  const { data } = await http.get<AllowedFolder[]>('/drive/folders');

  return data;
};

/**
 * Function to list the contents of a folder.
 * @param folderId - The Google Drive folder id
 * @returns The folder entries (folders first)
 */
export const getFolderContents = async (folderId: string): Promise<DriveEntry[]> => {
  const { data } = await http.get<DriveEntry[]>(`/drive/folders/${folderId}/contents`);

  return data;
};

/**
 * Function to create a subfolder inside a folder.
 * @param parentId - The parent folder id
 * @param name - The new folder name
 * @returns The created folder entry
 */
export const createSubfolder = async (parentId: string, name: string): Promise<DriveEntry> => {
  const { data } = await http.post<DriveEntry>(`/drive/folders/${parentId}/subfolder`, { name });

  return data;
};

/**
 * Function to upload a file into a folder, reporting progress.
 * @param folderId - The destination folder id
 * @param file - The file to upload
 * @param onProgress - Callback receiving the 0–100 progress percentage
 * @returns The upload result
 */
export interface UploadProgress {
  percent: number;
  /** Transfer rate in bytes/sec (null when unknown). */
  rate: number | null;
}

export const uploadFile = async (
  folderId: string,
  file: File,
  onProgress?: (progress: UploadProgress) => void,
  signal?: AbortSignal,
  name?: string,
): Promise<UploadResult> => {
  const formData = new FormData();
  // The multipart filename becomes the Drive file name — override it when renaming.
  formData.append('file', file, name ?? file.name);

  const { data } = await http.post<UploadResult>(`/drive/folders/${folderId}/upload`, formData, {
    signal,
    onUploadProgress: (event: AxiosProgressEvent) => {
      if (onProgress && event.total) {
        onProgress({
          percent: Math.round((event.loaded / event.total) * 100),
          rate:
            typeof event.rate === 'number' && Number.isFinite(event.rate) ? event.rate : null,
        });
      }
    },
  });

  return data;
};

/**
 * Function to delete a file.
 * @param fileId - The Google Drive file id
 */
export const deleteFile = async (fileId: string): Promise<void> => {
  await http.delete(`/drive/files/${fileId}`);
};
