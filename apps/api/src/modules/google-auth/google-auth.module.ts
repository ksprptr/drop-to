import { Module } from '@nestjs/common';

import { GoogleAuthController } from './google-auth.controller';
import { GoogleAuthService } from './google-auth.service';
import { DriveOwnerGuard } from './guards/drive-owner.guard';

@Module({
  controllers: [GoogleAuthController],
  providers: [GoogleAuthService, DriveOwnerGuard],
  exports: [GoogleAuthService],
})
export class GoogleAuthModule {}
