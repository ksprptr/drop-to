import type { StorageBackend } from '@dropto/types';

/**
 * Heroicon name used to represent each storage backend in the sidebar, storage
 * switcher and breadcrumb.
 */
export const STORAGE_ICON: Record<StorageBackend, string> = {
  drive: 'Cloud',
  s3: 'CircleStack',
};
