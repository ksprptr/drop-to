import type { StorageBackend } from '@dropto/types';

/** Icon name per storage backend. */
export const STORAGE_ICON: Record<StorageBackend, string> = {
  drive: 'Cloud',
  s3: 'CircleStack',
};
