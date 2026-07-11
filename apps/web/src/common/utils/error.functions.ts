import axios from 'axios';

import { ApiUnavailableError } from '@/common/services/axios/axios.errors';

/**
 * Function to extract a human-readable message from an unknown API error.
 * @param error - The caught error
 * @returns A message suitable for display in a toast
 */
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
 * Function to detect a request that was cancelled (e.g. an aborted upload).
 * @param error - The caught error
 * @returns True when the request was cancelled rather than failed
 */
export const isCanceledError = (error: unknown): boolean => axios.isCancel(error);
