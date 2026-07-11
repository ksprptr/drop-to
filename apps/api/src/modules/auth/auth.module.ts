import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { AuthTokensHelper } from '@/common/services/auth-tokens/auth-tokens.helper';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthHelpers } from './helpers/auth.helpers';

/**
 * Class representing an auth module.
 */
@Module({
  imports: [JwtModule.register({ global: true })],
  controllers: [AuthController],
  providers: [AuthService, AuthHelpers, AuthTokensHelper],
  exports: [AuthTokensHelper],
})
export class AuthModule {}
