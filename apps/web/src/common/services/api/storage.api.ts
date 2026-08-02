import 'server-only';
import type {
  DriveEntry,
  DriveEntryPage,
  ListContentsQuery,
  ResumableUploadSession,
  StorageBackend,
  StorageStatus,
  UploadResult,
  UploadStatus,
} from '@dropto/types';

import { getHttp } from '@/common/services/axios/axios.instance';
import { seg } from '@/common/utils/storage-path';

/**
 * Fetches the status of every storage backend (Drive + S3).
 **/
export const getStatuses = async (): Promise<StorageStatus[]> => {
  const http = await getHttp();
  const { data } = await http.get<StorageStatus[]>('/storage/status');

  return data;
};

/**
 * Lists one page of a folder's contents (cursor paginated; optional server-side search + sort).
 **/
export const listContents = async (
  backend: StorageBackend,
  folderId: string,
  query: ListContentsQuery = {},
): Promise<DriveEntryPage> => {
  const http = await getHttp();
  const { data } = await http.get<DriveEntryPage>(
    `/storage/${backend}/folders/${seg(folderId)}/contents`,
    {
      params: {
        ...(query.pageToken ? { pageToken: query.pageToken } : {}),
        ...(query.search ? { search: query.search } : {}),
        ...(query.sortKey ? { sort: query.sortKey } : {}),
        ...(query.sortDir ? { dir: query.sortDir } : {}),
      },
    },
  );

  return data;
};

/**
 * Resolves the display names of a set of ids (rebuilding a breadcrumb from a deep link).
 **/
export const resolveNames = async (
  backend: StorageBackend,
  ids: string[],
): Promise<{ id: string; name: string; webViewLink: string | null }[]> => {
  const http = await getHttp();
  const { data } = await http.get<{ id: string; name: string; webViewLink: string | null }[]>(
    `/storage/${backend}/names`,
    { params: { ids: ids.join(',') } },
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
 * Opens a resumable upload session; the browser then streams the file straight to storage.
 **/
export const createUploadSession = async (
  backend: StorageBackend,
  folderId: string,
  meta: { name: string; mimeType: string; size: number },
): Promise<ResumableUploadSession> => {
  const http = await getHttp();
  const { data } = await http.post<ResumableUploadSession>(
    `/storage/${backend}/folders/${seg(folderId)}/upload-session`,
    meta,
  );

  return data;
};

/**
 * Validates + records a browser-completed resumable upload, returning the stored file.
 **/
export const finalizeUpload = async (
  backend: StorageBackend,
  fileId: string,
): Promise<UploadResult> => {
  const http = await getHttp();
  const { data } = await http.post<UploadResult>(
    `/storage/${backend}/files/${seg(fileId)}/finalize`,
  );

  return data;
};

/**
 * Asks how many bytes a resumable session confirmed, so a dropped upload resumes from there.
 **/
export const getUploadStatus = async (
  backend: StorageBackend,
  uploadUrl: string,
  size: number,
): Promise<UploadStatus> => {
  const http = await getHttp();
  const { data } = await http.post<UploadStatus>(`/storage/${backend}/upload-status`, {
    uploadUrl,
    size,
  });

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
