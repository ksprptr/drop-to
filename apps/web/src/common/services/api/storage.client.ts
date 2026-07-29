import type { StorageBackend, UploadResult } from '@dropto/types';
import axios, { type AxiosProgressEvent } from 'axios';

import { createUploadSessionAction, finalizeUploadAction } from '@/actions/storage/storage.actions';

// Client-side storage: uploads (direct-to-Drive resumable / streamed S3) and download/preview URLs.

export interface UploadProgress {
  percent: number;
  /** Bytes/sec, null when unknown. */
  rate: number | null;
}

/**
 * Maps an axios upload event to our progress shape.
 **/
const toProgress = (event: AxiosProgressEvent): UploadProgress | null => {
  if (!event.total) {
    return null;
  }

  return {
    percent: Math.round((event.loaded / event.total) * 100),
    rate: typeof event.rate === 'number' && Number.isFinite(event.rate) ? event.rate : null,
  };
};

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
 * Drive direct upload: our API opens a resumable session server-side (the access token never reaches
 * the browser — only the one-file session URL does), the browser PUTs the bytes to Google, then the
 * API validates + records it. The file lands in the authorized folder, owned by the connected account.
 **/
const uploadToDriveDirect = async (
  folderId: string,
  file: File,
  uploadName: string,
  onProgress?: (progress: UploadProgress) => void,
  signal?: AbortSignal,
): Promise<UploadResult> => {
  const mimeType = file.type || 'application/octet-stream';

  const session = await createUploadSessionAction('drive', folderId, {
    name: uploadName,
    mimeType,
    size: file.size,
  });
  if (!session.ok || !session.data) {
    throw new Error(session.error ?? 'Failed to start the upload.');
  }

  // PUT the bytes straight to the Google session URL — no auth header (the URL is the capability),
  // no cookies to Google. Reports real transfer progress + rate.
  const putRes = await axios.put<{ id?: string }>(session.data.uploadUrl, file, {
    signal,
    headers: { 'Content-Type': mimeType },
    withCredentials: false,
    onUploadProgress: (event) => {
      const progress = toProgress(event);
      if (onProgress && progress) onProgress(progress);
    },
  });

  const fileId = putRes.data?.id;
  if (!fileId) {
    throw new Error('The upload did not complete.');
  }

  const finalized = await finalizeUploadAction('drive', fileId);
  if (!finalized.ok || !finalized.data) {
    throw new Error(finalized.error ?? 'Failed to finalize the upload.');
  }

  return finalized.data;
};

/**
 * Uploads a file. Drive uses a resumable session and streams the bytes **straight to Google**
 * (bypasses the app server + any CDN body-size cap, e.g. Cloudflare's 100 MB); S3 streams through the
 * same-origin route. Progress + ETA come from the actual byte transfer in both cases.
 **/
export const uploadFile = async (
  backend: StorageBackend,
  folderId: string,
  file: File,
  onProgress?: (progress: UploadProgress) => void,
  signal?: AbortSignal,
  name?: string,
): Promise<UploadResult> => {
  const uploadName = name ?? file.name;

  if (backend === 'drive') {
    return uploadToDriveDirect(folderId, file, uploadName, onProgress, signal);
  }

  const formData = new FormData();
  // The multipart filename becomes the stored file name — override when renaming.
  formData.append('file', file, uploadName);

  const { data } = await axios.post<UploadResult>(
    `/api/storage/${backend}/folders/${folderId}/upload`,
    formData,
    {
      signal,
      onUploadProgress: (event) => {
        const progress = toProgress(event);
        if (onProgress && progress) onProgress(progress);
      },
    },
  );

  return data;
};
