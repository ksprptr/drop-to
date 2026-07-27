import { HttpException, HttpStatus } from '@nestjs/common';

/** Toast/sidebar message shown when the Google Drive connection is no longer usable. */
export const DRIVE_DISCONNECTED_MESSAGE = 'Your Google Drive was disconnected. Please reconnect it.';

/** Sidebar/toast message shown when the configured S3 storage cannot be reached. */
export const S3_UNAVAILABLE_MESSAGE =
  "This S3 storage doesn't exist or the credentials are invalid.";

/**
 * 424 (not 401/5xx): lets the client detect a disconnected backend without tripping silent-refresh.
 **/
export class StorageDisconnectedException extends HttpException {
  constructor(message: string) {
    super(message, HttpStatus.FAILED_DEPENDENCY);
  }
}

/**
 * Detects Google's `invalid_grant` (expired/revoked refresh token), however deeply wrapped.
 **/
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

// True only for whole-backend failures (missing bucket, bad creds, 5xx); per-item 4xx excluded.
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
