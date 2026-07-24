import { HttpException, HttpStatus } from '@nestjs/common';

/** Toast/sidebar message shown when the Google Drive connection is no longer usable. */
export const DRIVE_DISCONNECTED_MESSAGE = 'Your Google Drive was disconnected. Please reconnect it.';

/** Sidebar/toast message shown when the configured S3 storage cannot be reached. */
export const S3_UNAVAILABLE_MESSAGE =
  "This S3 storage doesn't exist or the credentials are invalid.";

/**
 * Thrown when a storage backend the app expects to be connected can no longer be
 * reached — a revoked/expired Drive refresh token, or an unreachable/misconfigured
 * S3 bucket. Uses **424 Failed Dependency** so the web client can tell a
 * "backend disconnected" error apart from a generic failure (and prompt a
 * reconnect), and so it never trips the operator's 401 → silent-refresh
 * interceptor. As a 4xx it is logged as a warning, not a noisy 5xx stack.
 */
export class StorageDisconnectedException extends HttpException {
  constructor(message: string) {
    super(message, HttpStatus.FAILED_DEPENDENCY);
  }
}

/**
 * Detects Google's `invalid_grant` OAuth error (an expired or revoked refresh
 * token) inside a googleapis/gaxios error, however deeply it is wrapped.
 * @param error - The caught error
 * @returns True when the error is an `invalid_grant`
 */
export function isInvalidGrant(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as { message?: unknown; response?: { data?: unknown } };
  if (candidate.message === 'invalid_grant') {
    return true;
  }

  const data = candidate.response?.data as { error?: unknown } | undefined;

  return data?.error === 'invalid_grant';
}

/**
 * Detects an S3 error that means the backend is unusable — a missing bucket, bad
 * credentials, or an unreachable/erroring endpoint (5xx). Legitimate per-item 4xx
 * (e.g. a forbidden object key) are intentionally excluded so real permission
 * errors still surface as themselves.
 * @param error - The caught error
 * @returns True when the whole S3 backend should be treated as disconnected
 */
export function isS3Unavailable(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as { name?: unknown; $metadata?: { httpStatusCode?: number } };
  const httpStatusCode = candidate.$metadata?.httpStatusCode;
  if (typeof httpStatusCode === 'number' && httpStatusCode >= 500) {
    return true;
  }

  const name = typeof candidate.name === 'string' ? candidate.name : '';

  return [
    'NoSuchBucket',
    'NotFound',
    'InvalidAccessKeyId',
    'SignatureDoesNotMatch',
    'InvalidBucketName',
    'AccessDenied',
    'CredentialsProviderError',
    'UnknownEndpoint',
    'NetworkingError',
  ].includes(name);
}
