import { Module } from '@nestjs/common';

import { GoogleAuthModule } from '@/modules/google-auth/google-auth.module';

import { GoogleDriveProvider } from './providers/google-drive.provider';
import { S3StorageProvider } from './providers/s3-storage.provider';
import { PublicLinkController } from './public-link.controller';
import { PublicLinkService } from './public-link.service';
import { StorageController } from './storage.controller';
import { StorageRegistry } from './storage.registry';

@Module({
  imports: [GoogleAuthModule],
  controllers: [StorageController, PublicLinkController],
  providers: [GoogleDriveProvider, S3StorageProvider, StorageRegistry, PublicLinkService],
  exports: [StorageRegistry],
})
export class StorageModule {}
