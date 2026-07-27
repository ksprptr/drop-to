import { Injectable, NotFoundException } from '@nestjs/common';

import {
  STORAGE_BACKENDS,
  StorageBackend,
  StorageProvider,
} from './interfaces/storage-provider.interface';
import { GoogleDriveProvider } from './providers/google-drive.provider';
import { S3StorageProvider } from './providers/s3-storage.provider';

/**
 * Resolves a StorageProvider by its backend key.
 **/
@Injectable()
export class StorageRegistry {
  private readonly providers: Record<StorageBackend, StorageProvider>;

  constructor(drive: GoogleDriveProvider, s3: S3StorageProvider) {
    this.providers = { drive, s3 };
  }

  /**
   * Resolves the provider for a backend key; 404 when unknown.
   **/
  resolve(backend: string): StorageProvider {
    if (!this.isBackend(backend)) {
      throw new NotFoundException(`Unknown storage backend: ${backend}`);
    }

    return this.providers[backend];
  }

  /**
   * Returns every provider, in sidebar order.
   **/
  all(): StorageProvider[] {
    return STORAGE_BACKENDS.map((backend) => this.providers[backend]);
  }

  /**
   * Type guard for a known backend key.
   **/
  private isBackend(value: string): value is StorageBackend {
    return (STORAGE_BACKENDS as string[]).includes(value);
  }
}
