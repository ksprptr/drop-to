/** Shared API contract types between the NestJS API (`apps/api`) and the Next.js web app (`apps/web`). */

/** A folder that has been explicitly authorized via the Google Picker setup flow. */
export interface AllowedFolder {
  id: string;
  folderId: string;
  name: string;
  createdAt: string;
}

/** An entry (file or folder) returned when listing the contents of a Drive folder. */
export interface DriveEntry {
  id: string;
  name: string;
  mimeType: string;
  isFolder: boolean;
  size: number | null;
  modifiedTime: string | null;
  iconLink: string | null;
  webViewLink: string | null;
}

/** One page of folder contents; `nextPageToken` is the cursor for the next page (null = last page). */
export interface DriveEntryPage {
  entries: DriveEntry[];
  nextPageToken: string | null;
}

/** How the browser wants a folder listed: cursor page + optional server-side search/sort. */
export interface ListContentsQuery {
  pageToken?: string;
  search?: string;
  sortKey?: 'name' | 'modified' | 'size';
  sortDir?: 'asc' | 'desc';
}

/** Result of a successful file upload. */
export interface UploadResult {
  fileId: string;
  fileName: string;
  size: number | null;
  webViewLink: string | null;
}

/** A resumable upload session: the browser PUTs the file bytes straight to `uploadUrl` (bypasses the app + CDN). */
export interface ResumableUploadSession {
  uploadUrl: string;
  /** How long the browser waits for a dropped connection before failing this upload (ms). */
  offlineTimeoutMs: number;
}

/** How far a resumable session got — so a dropped upload resumes from `receivedBytes` (never re-uploads whole). */
export interface ResumableUploadStatus {
  complete: boolean;
  receivedBytes: number;
  fileId: string | null;
}

/** Payload sent from the Picker setup flow to persist the selected folders. */
export interface SaveFoldersPayload {
  folders: Array<{ folderId: string; name: string }>;
}

/** The authenticated operator returned by `GET /auth/me`. */
export interface AuthUser {
  username: string;
}

/** A storage backend the workspace can browse. */
export type StorageBackend = 'drive' | 's3';

/** A browse root within a storage backend (Drive authorized folder or S3 bucket); `id` browses into it. */
export interface StorageRoot {
  id: string;
  name: string;
}

/** Connection status of a storage backend for the sidebar and switcher; `connected` means usable, `email` is Drive-only. */
export interface StorageStatus {
  backend: StorageBackend;
  label: string;
  connected: boolean;
  roots: StorageRoot[];
  email?: string | null;
  /** Human-readable reason the configured backend broke (revoked Drive token, unreachable S3 bucket). */
  error?: string | null;
  isOwner?: boolean;
  /** Storage usage of the connected account (Drive only); bytes, `limit` null = unlimited/unknown. */
  quota?: { usage: number; limit: number | null } | null;
}
