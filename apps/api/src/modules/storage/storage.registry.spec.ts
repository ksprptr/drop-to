import { NotFoundException } from '@nestjs/common';

import { GoogleDriveProvider } from './providers/google-drive.provider';
import { S3StorageProvider } from './providers/s3-storage.provider';
import { StorageRegistry } from './storage.registry';

describe('StorageRegistry', () => {
  const makeRegistry = (driveEnabled: boolean, s3Enabled: boolean) => {
    const drive = { backend: 'drive', enabled: driveEnabled } as unknown as GoogleDriveProvider;
    const s3 = { backend: 's3', enabled: s3Enabled } as unknown as S3StorageProvider;

    return { drive, s3, registry: new StorageRegistry(drive, s3) };
  };

  it('resolves a provider by its backend key', () => {
    const { drive, s3, registry } = makeRegistry(true, true);

    expect(registry.resolve('drive')).toBe(drive);
    expect(registry.resolve('s3')).toBe(s3);
  });

  it('throws 404 for an unknown backend key', () => {
    const { registry } = makeRegistry(true, true);

    expect(() => registry.resolve('nope')).toThrow(NotFoundException);
    expect(() => registry.resolve('')).toThrow(NotFoundException);
  });

  it('throws 404 for a backend disabled in the environment', () => {
    const { registry } = makeRegistry(false, true);

    expect(() => registry.resolve('drive')).toThrow(NotFoundException);
    expect(registry.isEnabled('drive')).toBe(false);
    expect(registry.isEnabled('s3')).toBe(true);
  });

  it('returns every enabled provider in sidebar order (drive, s3)', () => {
    const { drive, s3, registry } = makeRegistry(true, true);

    expect(registry.all()).toEqual([drive, s3]);
  });

  it('omits disabled providers from the sidebar list', () => {
    const { s3, registry } = makeRegistry(false, true);

    expect(registry.all()).toEqual([s3]);
    expect(makeRegistry(false, false).registry.all()).toEqual([]);
  });
});
