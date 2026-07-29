import { HttpStatus } from '@nestjs/common';

import { isInvalidGrant, isS3Unavailable, StorageDisconnectedException } from './storage.errors';

describe('storage.errors', () => {
  describe('StorageDisconnectedException', () => {
    it('is a 424 Failed Dependency carrying the message', () => {
      const error = new StorageDisconnectedException('gone');

      expect(error.getStatus()).toBe(HttpStatus.FAILED_DEPENDENCY);
      expect(error.getStatus()).toBe(424);
      expect(error.message).toBe('gone');
    });
  });

  describe('isInvalidGrant', () => {
    it('detects a top-level invalid_grant message', () => {
      expect(isInvalidGrant({ message: 'invalid_grant' })).toBe(true);
    });

    it('detects invalid_grant nested in response.data.error', () => {
      expect(isInvalidGrant({ response: { data: { error: 'invalid_grant' } } })).toBe(true);
    });

    it('is false for unrelated errors and non-objects', () => {
      expect(isInvalidGrant(new Error('boom'))).toBe(false);
      expect(isInvalidGrant({ response: { data: { error: 'access_denied' } } })).toBe(false);
      expect(isInvalidGrant(null)).toBe(false);
      expect(isInvalidGrant('invalid_grant')).toBe(false);
    });
  });

  describe('isS3Unavailable', () => {
    it('is true for a 5xx response', () => {
      expect(isS3Unavailable({ $metadata: { httpStatusCode: 503 } })).toBe(true);
      expect(isS3Unavailable({ $metadata: { httpStatusCode: 500 } })).toBe(true);
    });

    it('is true for whole-backend error names', () => {
      for (const name of [
        'NoSuchBucket',
        'InvalidAccessKeyId',
        'SignatureDoesNotMatch',
        'NetworkingError',
      ]) {
        expect(isS3Unavailable({ name })).toBe(true);
      }
    });

    it('is false for a per-item 4xx / unknown error / non-object', () => {
      expect(isS3Unavailable({ $metadata: { httpStatusCode: 403 }, name: 'SomeItemError' })).toBe(
        false,
      );
      expect(isS3Unavailable({ name: 'NoSuchKey' })).toBe(false);
      expect(isS3Unavailable(null)).toBe(false);
      expect(isS3Unavailable(new Error('boom'))).toBe(false);
    });
  });
});
