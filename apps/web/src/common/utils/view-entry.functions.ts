import type { DriveEntry } from '@dropto/types';

import type { ViewEntry } from '@/common/types/workspace.types';

/**
 * Maps API drive entries to the workspace's view-entry shape (drops the unused iconLink).
 **/
export const toViewEntries = (entries: DriveEntry[]): ViewEntry[] =>
  entries.map((entry) => ({
    id: entry.id,
    name: entry.name,
    isFolder: entry.isFolder,
    size: entry.size,
    mimeType: entry.mimeType,
    modifiedTime: entry.modifiedTime,
    webViewLink: entry.webViewLink,
  }));
