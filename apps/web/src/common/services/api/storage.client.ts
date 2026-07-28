import type { StorageBackend, UploadResult } from '@dropto/types';
import axios, { type AxiosProgressEvent } from 'axios';

// Client-side storage: streamed uploads and download/preview URLs, all via same-origin route handlers.

export interface UploadProgress {
  percent: number;
  /** Bytes/sec, null when unknown. */
  rate: number | null;
}

/**
 * Same-origin URL that streams a file download (proxied to the API).
 **/
export const fileDownloadUrl = (backend: StorageBackend, id: string): string =>
  `/api/storage/${backend}/files/${id}/download`;

/**
 * Same-origin URL that streams a folder as a ZIP (proxied to the API).
 **/
export const folderDownloadUrl = (backend: StorageBackend, id: string): string =>
  `/api/storage/${backend}/folders/${id}/download`;

/**
 * Uploads a file via the same-origin route handler, reporting progress.
 **/
export const uploadFile = async (
  backend: StorageBackend,
  folderId: string,
  file: File,
  onProgress?: (progress: UploadProgress) => void,
  signal?: AbortSignal,
  name?: string,
): Promise<UploadResult> => {
  const formData = new FormData();
  // The multipart filename becomes the stored file name — override when renaming.
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
