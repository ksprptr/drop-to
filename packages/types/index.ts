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

/** Result of a successful file upload. */
export interface UploadResult {
  fileId: string;
  fileName: string;
  size: number | null;
  webViewLink: string | null;
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
}
