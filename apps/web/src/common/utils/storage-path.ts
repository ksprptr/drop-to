import type { StorageBackend } from '@dropto/types';

const BACKENDS: readonly StorageBackend[] = ['drive', 's3'];

/**
 * Validates the `:backend` key so a crafted value can't inject a different upstream path.
 **/
export const assertBackend = (backend: string): StorageBackend => {
  if (!BACKENDS.includes(backend as StorageBackend)) {
    throw new Error(`Unknown storage backend: ${backend}`);
  }

  return backend as StorageBackend;
};

/**
 * URL-encodes a single path segment (ids can otherwise inject `../`, `?` or `#` into the API path).
 **/
export const seg = (value: string): string => encodeURIComponent(value);
