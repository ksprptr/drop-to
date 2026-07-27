import axios from 'axios';

import { ApiUnavailableError } from '@/common/services/axios/axios.errors';

/**
 * Extracts a human-readable message from an unknown API error, for a toast.
 **/
export const extractApiErrorMessage = (error: unknown): string => {
  if (error instanceof ApiUnavailableError) {
    return error.message;
  }

  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string | string[] } | undefined;

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
export const isCanceledError = (error: unknown): boolean => axios.isCancel(error);
