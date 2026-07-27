import { NotFoundException } from '@nestjs/common';

import { GoogleDriveProvider } from './providers/google-drive.provider';
import { S3StorageProvider } from './providers/s3-storage.provider';
import { StorageRegistry } from './storage.registry';

describe('StorageRegistry', () => {
  const drive = { backend: 'drive' } as unknown as GoogleDriveProvider;
  const s3 = { backend: 's3' } as unknown as S3StorageProvider;
  const registry = new StorageRegistry(drive, s3);

  it('resolves a provider by its backend key', () => {
    expect(registry.resolve('drive')).toBe(drive);
    expect(registry.resolve('s3')).toBe(s3);
  });

  it('throws 404 for an unknown backend key', () => {
    expect(() => registry.resolve('nope')).toThrow(NotFoundException);
    expect(() => registry.resolve('')).toThrow(NotFoundException);
  });

  it('returns every provider in sidebar order (drive, s3)', () => {
    expect(registry.all()).toEqual([drive, s3]);
  });
});
