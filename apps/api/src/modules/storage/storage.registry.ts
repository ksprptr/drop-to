import { Injectable, NotFoundException } from '@nestjs/common';

import {
  STORAGE_BACKENDS,
  StorageBackend,
  StorageProvider,
} from './interfaces/storage-provider.interface';
import { GoogleDriveProvider } from './providers/google-drive.provider';
import { S3StorageProvider } from './providers/s3-storage.provider';

/**
 * Resolves a StorageProvider by its backend key; a backend switched off in the env is invisible here.
 **/
// The single place the env kill-switches (GOOGLE_ENABLED / S3_ENABLED) are enforced for the whole /storage surface.
@Injectable()
export class StorageRegistry {
  private readonly providers: Record<StorageBackend, StorageProvider>;

  constructor(drive: GoogleDriveProvider, s3: S3StorageProvider) {
    this.providers = { drive, s3 };
  }

  /**
   * Resolves the provider for a backend key; 404 when unknown or disabled.
   **/
  resolve(backend: string): StorageProvider {
    if (!this.isBackend(backend)) {
      throw new NotFoundException(`Unknown storage backend: ${backend}`);
    }

    const provider = this.providers[backend];
    // A disabled backend is indistinguishable from an unknown one — nothing of it is reachable.
    if (!provider.enabled) {
      throw new NotFoundException(`Storage backend is not enabled: ${backend}`);
    }

    return provider;
  }

  /**
   * Returns every enabled provider, in sidebar order.
   **/
  all(): StorageProvider[] {
    return STORAGE_BACKENDS.map((backend) => this.providers[backend]).filter(
      (provider) => provider.enabled,
    );
  }

  /**
   * Whether a backend key is known and switched on.
   **/
  isEnabled(backend: string): boolean {
    return this.isBackend(backend) && this.providers[backend].enabled;
  }

  /**
   * Type guard for a known backend key.
   **/
  private isBackend(value: string): value is StorageBackend {
    return (STORAGE_BACKENDS as string[]).includes(value);
  }
}
