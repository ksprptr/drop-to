import { isAxiosError } from 'axios';

/** Result of a Server Action, consumed by client code to toast success/failure. */
export interface ActionResult<T = void> {
  ok: boolean;
  data?: T;
  error?: string;
  /** The API HTTP status when the call failed (e.g. 424 = storage disconnected). */
  status?: number;
}

/**
 * Extracts the NestJS `{ message }` from a caught API error, or undefined.
 **/
export const extractApiError = (error: unknown): string | undefined => {
  if (isAxiosError(error)) {
    const payload = error.response?.data as { message?: string | string[] } | undefined;

    if (payload?.message) {
      return Array.isArray(payload.message) ? payload.message.join(', ') : payload.message;
    }
  }

  return undefined;
};

/**
 * Wraps a server-side API call into a serializable {@link ActionResult} (never throws).
 **/
export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    const status = isAxiosError(error) ? error.response?.status : undefined;
    return { ok: false, error: extractApiError(error), status };
  }
}
