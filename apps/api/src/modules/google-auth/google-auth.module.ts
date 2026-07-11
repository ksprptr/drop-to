import { Module } from '@nestjs/common';

import { GoogleAuthController } from './google-auth.controller';
import { GoogleAuthService } from './google-auth.service';

/**
 * Class representing a google auth module
 */
@Module({
  controllers: [GoogleAuthController],
  providers: [GoogleAuthService],
  exports: [GoogleAuthService],
})
export class GoogleAuthModule {}
