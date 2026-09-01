import type { StorageBackend, UploadResult } from '@dropto/types';
import axios, { type AxiosProgressEvent, CanceledError } from 'axios';

import {
  createUploadSessionAction,
  finalizeUploadAction,
  uploadStatusAction,
} from '@/actions/storage/storage.actions';

/** Fallback offline timeout (ms) if the API session response doesn't carry one. */
const DEFAULT_OFFLINE_TIMEOUT_MS = 30_000;

/**
 * Resolves once back online; rejects on user-abort, or with "Connection lost." after `timeoutMs` still offline.
 **/
const waitForOnline = (timeoutMs: number, signal?: AbortSignal): Promise<void> => {
  if (typeof navigator === 'undefined' || navigator.onLine) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>;

    const onOnline = () => {
      stop();
      resolve();
    };
    const onAbort = () => {
      stop();
      reject(new CanceledError());
    };

    function stop() {
      window.removeEventListener('online', onOnline);
      signal?.removeEventListener('abort', onAbort);
      clearTimeout(timer);
    }

    timer = setTimeout(() => {
      stop();
      reject(new Error('Connection lost.'));
    }, timeoutMs);

    window.addEventListener('online', onOnline);
    signal?.addEventListener('abort', onAbort);
  });
};

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
 * Drive direct upload: API opens a resumable session (access token never reaches the browser, only the session URL), the browser PUTs bytes to Google, then the API validates + records it.
 **/
const uploadToDriveDirect = async (
  folderId: string,
  file: File,
  uploadName: string,
  onProgress?: (progress: UploadProgress) => void,
  signal?: AbortSignal,
): Promise<UploadResult> => {
  const mimeType = file.type || 'application/octet-stream';
  const size = file.size;

  const session = await createUploadSessionAction('drive', folderId, {
    name: uploadName,
    mimeType,
    size,
  });
  if (!session.ok || !session.data) {
    throw new Error(session.error ?? 'Failed to start the upload.');
  }
  const uploadUrl = session.data.uploadUrl;
  const offlineTimeoutMs = session.data.offlineTimeoutMs || DEFAULT_OFFLINE_TIMEOUT_MS;

  let offset = 0; // bytes the server has confirmed received — we only ever advance to this
  let recheck = false; // after a drop: ask the server how far it got, then resume from there
  let fileId: string | undefined;

  // Resumable loop: a drop pauses the PUT; wait up to OFFLINE_TIMEOUT_MS, then resume from the server-confirmed offset, else fail without a partial file.
  for (;;) {
    if (signal?.aborted) {
      throw new CanceledError();
    }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      // eslint-disable-next-line no-await-in-loop -- deliberate: pause until the connection returns
      await waitForOnline(offlineTimeoutMs, signal);
    }

    if (recheck) {
      // eslint-disable-next-line no-await-in-loop -- deliberate: server-side status query (reads Range)
      const status = await uploadStatusAction('drive', uploadUrl, size);
      if (!status.ok || !status.data) {
        throw new Error(status.error ?? 'Failed to resume the upload.');
      }
      if (status.data.complete) {
        fileId = status.data.fileId ?? undefined;
        break;
      }
      offset = status.data.receivedBytes;
      recheck = false;
    }

    // Abort this attempt if the user cancels or the connection drops.
    const attempt = new AbortController();
    const abortAttempt = () => attempt.abort();
    window.addEventListener('offline', abortAttempt);
    signal?.addEventListener('abort', abortAttempt);

    try {
      // PUT the remaining bytes to the Google session URL (the URL is the capability — no auth header/cookies); progress offset by confirmed bytes.
      // eslint-disable-next-line no-await-in-loop -- deliberate: one (resumable) attempt per loop turn
      const res = await axios.put<{ id?: string }>(
        uploadUrl,
        offset > 0 ? file.slice(offset) : file,
        {
          signal: attempt.signal,
          withCredentials: false,
          headers: {
            'Content-Type': mimeType,
            ...(offset > 0 ? { 'Content-Range': `bytes ${offset}-${size - 1}/${size}` } : {}),
          },
          validateStatus: (statusCode) =>
            (statusCode >= 200 && statusCode < 300) || statusCode === 308,
          onUploadProgress: (event) => {
            if (!onProgress) return;
            const loaded = offset + event.loaded;
            onProgress({
              percent: Math.min(100, Math.round((loaded / size) * 100)),
              rate:
                typeof event.rate === 'number' && Number.isFinite(event.rate) ? event.rate : null,
            });
          },
        },
      );
      if (res.status === 308) {
        recheck = true; // Google wants more — re-query the confirmed offset and continue
        continue;
      }
      fileId = res.data?.id;
      break;
    } catch (error) {
      if (signal?.aborted) {
        throw error; // user canceled
      }
      if (typeof navigator !== 'undefined' && navigator.onLine && !attempt.signal.aborted) {
        throw error; // a genuine error while online
      }
      recheck = true; // connection dropped — pause, wait, ask the server, resume
    } finally {
      window.removeEventListener('offline', abortAttempt);
      signal?.removeEventListener('abort', abortAttempt);
    }
  }

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
 * Uploads a file — Drive streams straight to Google via a resumable session, S3 through the same-origin route.
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
