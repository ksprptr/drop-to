/**
 * Shared API contract types between the NestJS API (`apps/api`) and the
 * Next.js web app (`apps/web`). These mirror the response entities returned
 * by the Drive/GoogleAuth controllers so the frontend can stay strongly typed
 * without importing NestJS server code.
 */

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

/** Connection status of the authorized Google Drive account. */
export interface DriveAccountStatus {
  connected: boolean;
  email: string | null;
  allowedFolders: AllowedFolder[];
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

/** Payload sent to log the operator in. */
export interface LoginPayload {
  username: string;
  password: string;
}

/** The authenticated operator returned by `GET /auth/me`. */
export interface AuthUser {
  username: string;
}

/** Standard API error envelope produced by the API's global exception filter. */
export interface ApiErrorResponse {
  status: number;
  message: string | string[];
}
