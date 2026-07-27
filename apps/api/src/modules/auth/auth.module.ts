import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { AuthTokensHelper } from '@/common/services/auth-tokens/auth-tokens.helper';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthStateService } from './auth-state.service';
import { AuthHelpers } from './helpers/auth.helpers';

@Module({
  imports: [JwtModule.register({ global: true })],
  controllers: [AuthController],
  providers: [AuthService, AuthStateService, AuthHelpers, AuthTokensHelper],
  exports: [AuthTokensHelper, AuthStateService],
})
export class AuthModule {}
