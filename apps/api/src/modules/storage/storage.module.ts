import { Module } from '@nestjs/common';

import { GoogleAuthModule } from '@/modules/google-auth/google-auth.module';

import { GoogleDriveProvider } from './providers/google-drive.provider';
import { S3StorageProvider } from './providers/s3-storage.provider';
import { StorageController } from './storage.controller';
import { StorageRegistry } from './storage.registry';

/**
 * Class representing the storage module.
 *
 * Registers every storage backend provider and the {@link StorageRegistry} that
 * resolves them by key. The controller is backend-agnostic and drives them all
 * through the {@link StorageProvider} interface; adding a backend (e.g. another
 * object store) is a new provider class registered in the {@link StorageRegistry}.
 */
@Module({
  imports: [GoogleAuthModule],
  controllers: [StorageController],
  providers: [GoogleDriveProvider, S3StorageProvider, StorageRegistry],
  exports: [StorageRegistry],
})
export class StorageModule {}
