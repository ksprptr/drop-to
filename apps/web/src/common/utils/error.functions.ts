import { isAxiosError, isCancel } from 'axios';

import { ApiUnavailableError } from '@/common/services/axios/axios.errors';

/**
 * Extracts a human-readable message from an unknown API error, for a toast.
 **/
export const extractApiErrorMessage = (error: unknown): string => {
  if (error instanceof ApiUnavailableError) {
    return error.message;
  }

  if (isAxiosError(error)) {
    if (!error.response) {
      return typeof navigator !== 'undefined' && !navigator.onLine
        ? 'Connection lost.'
        : 'Network error — could not reach the server.';
    }

    const data = error.response.data as { message?: string | string[] } | undefined;

    if (data?.message) {
      return Array.isArray(data.message) ? data.message.join(', ') : data.message;
    }

    return error.message;
  }

  return error instanceof Error ? error.message : 'An unexpected error occurred.';
};

/**
 * True when the request was cancelled (e.g. an aborted upload).
 **/
export const isCanceledError = (error: unknown): boolean => isCancel(error);
