import { Module } from '@nestjs/common';

import { GoogleAuthModule } from '@/modules/google-auth/google-auth.module';

import { STORAGE_PROVIDER } from './interfaces/storage-provider.interface';
import { GoogleDriveProvider } from './providers/google-drive.provider';
import { StorageController } from './storage.controller';

/**
 * Class representing the storage module.
 *
 * Binds the `STORAGE_PROVIDER` token to the concrete backend. Today that is
 * {@link GoogleDriveProvider}; switching to another backend (e.g. S3) is a
 * single-line change here — no controller touches a concrete provider.
 */
@Module({
  imports: [GoogleAuthModule],
  controllers: [StorageController],
  providers: [{ provide: STORAGE_PROVIDER, useClass: GoogleDriveProvider }],
  exports: [STORAGE_PROVIDER],
})
export class StorageModule {}
