/** A file or folder as rendered in the workspace. */
export interface ViewEntry {
  id: string;
  name: string;
  isFolder: boolean;
  size: number | null;
  mimeType: string | null;
  modifiedTime: string | null;
  webViewLink: string | null;
}

/** A single hop in the folder navigation path. */
export interface Crumb {
  id: string;
  name: string;
}

/** A file queued for upload, with its path relative to the drop/selection root. */
export interface UploadItem {
  file: File;
  /** e.g. `photos/2024/img.jpg` for folders, or `img.jpg` for loose files. */
  relativePath: string;
  /** Overridden upload name (for "keep both" duplicate handling). */
  uploadName?: string;
}

/** State of a single file upload. */
export interface UploadTask {
  id: string;
  name: string;
  size: number;
  percent: number;
  /** Bytes/sec, null when not actively uploading. */
  rate: number | null;
  status: 'pending' | 'uploading' | 'processing' | 'done' | 'error' | 'canceled';
}

/** A group of files uploaded together (one drop / selection). */
export interface UploadBatch {
  id: string;
  kind: 'files' | 'folder';
  /** Top-level folder name for folder uploads. */
  folderName: string | null;
  tasks: UploadTask[];
  status: 'uploading' | 'canceling' | 'canceled' | 'done';
}

/** A download being prepared on the server (streamed once ready). */
export interface DownloadTask {
  id: string;
  name: string;
}

/** Per-batch runtime handles: the abort controller and the ids created so far (for rollback). */
export interface BatchRuntime {
  controller: AbortController;
  looseFileIds: string[];
  rootFolderIds: string[];
}
