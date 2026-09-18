import { Module } from '@nestjs/common';

import { GoogleAuthController } from './google-auth.controller';
import { GoogleAuthService } from './google-auth.service';
import { DriveOwnerGuard } from './guards/drive-owner.guard';
import { GoogleEnabledGuard } from './guards/google-enabled.guard';

@Module({
  controllers: [GoogleAuthController],
  providers: [GoogleAuthService, DriveOwnerGuard, GoogleEnabledGuard],
  exports: [GoogleAuthService],
})
export class GoogleAuthModule {}
