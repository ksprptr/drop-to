import type { StorageBackend, UploadResult } from '@dropto/types';
import axios, { type AxiosProgressEvent } from 'axios';

/**
 * Client-side storage helpers — the only browser↔server data paths that can't be
 * Server Actions: streamed uploads (need progress + abort) and download/preview
 * URLs (direct browser navigation / `<img>` src). All target same-origin Next
 * Route Handlers, which forward server-to-server to the API.
 */

/** Upload progress reported to the caller. */
export interface UploadProgress {
  percent: number;
  /** Transfer rate in bytes/sec (null when unknown). */
  rate: number | null;
}

/**
 * Builds the same-origin URL that streams a file download (proxied to the API).
 * @param backend - The storage backend
 * @param id - The file id
 * @returns The download URL
 */
export const fileDownloadUrl = (backend: StorageBackend, id: string): string =>
  `/api/storage/${backend}/files/${id}/download`;

/**
 * Builds the same-origin URL that streams a folder as a ZIP (proxied to the API).
 * @param backend - The storage backend
 * @param id - The folder id
 * @returns The ZIP download URL
 */
export const folderDownloadUrl = (backend: StorageBackend, id: string): string =>
  `/api/storage/${backend}/folders/${id}/download`;

/**
 * Uploads a file into a folder via the same-origin route handler, reporting progress.
 * @param backend - The storage backend
 * @param folderId - The destination folder id
 * @param file - The file to upload
 * @param onProgress - Callback receiving progress (percent + rate)
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

  const { data } = await axios.post<UploadResult>(
    `/api/storage/${backend}/folders/${folderId}/upload`,
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
