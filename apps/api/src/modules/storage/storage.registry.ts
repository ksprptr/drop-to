import { Injectable, NotFoundException } from '@nestjs/common';

import {
  STORAGE_BACKENDS,
  StorageBackend,
  StorageProvider,
} from './interfaces/storage-provider.interface';
import { GoogleDriveProvider } from './providers/google-drive.provider';
import { S3StorageProvider } from './providers/s3-storage.provider';

/**
 * Resolves a {@link StorageProvider} by its backend key.
 *
 * The controller is fully backend-agnostic: it takes the `:backend` route param,
 * asks the registry for the matching provider, and calls the shared interface.
 * Adding a backend means implementing {@link StorageProvider} and registering it
 * here — no controller changes.
 */
@Injectable()
export class StorageRegistry {
  private readonly providers: Record<StorageBackend, StorageProvider>;

  constructor(drive: GoogleDriveProvider, s3: S3StorageProvider) {
    this.providers = { drive, s3 };
  }

  /**
   * Resolves the provider for a backend key.
   * @param backend - The backend key from the request
   * @returns The matching provider
   * @throws NotFoundException when the key is not a known backend
   */
  resolve(backend: string): StorageProvider {
    if (!this.isBackend(backend)) {
      throw new NotFoundException(`Unknown storage backend: ${backend}`);
    }

    return this.providers[backend];
  }

  /**
   * Returns every provider, in sidebar order.
   * @returns All registered providers
   */
  all(): StorageProvider[] {
    return STORAGE_BACKENDS.map((backend) => this.providers[backend]);
  }

  /**
   * Type guard for a known backend key.
   * @param value - The candidate key
   * @returns Whether it is a known backend
   */
  private isBackend(value: string): value is StorageBackend {
    return (STORAGE_BACKENDS as string[]).includes(value);
  }
}
