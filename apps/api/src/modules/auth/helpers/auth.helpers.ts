import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
} from '@/common/services/auth-tokens/auth-tokens.constants';
import { RequestUser } from '@/common/types/auth-user.types';
import { type JwtConfig, jwtConfig } from '@/config/jwt.config';

/** Signs the access and refresh JWTs (same `{ sub }` payload, different secret/lifetime). */
@Injectable()
export class AuthHelpers {
  constructor(
    private readonly jwtService: JwtService,
    @Inject(jwtConfig.KEY) private readonly jwtCfg: JwtConfig,
  ) {}

  signAccessToken(payload: RequestUser): Promise<string> {
    return this.jwtService.signAsync(payload, {
      secret: this.jwtCfg.accessSecret,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    });
  }

  signRefreshToken(payload: RequestUser): Promise<string> {
    return this.jwtService.signAsync(payload, {
      secret: this.jwtCfg.refreshSecret,
      expiresIn: REFRESH_TOKEN_TTL_SECONDS,
    });
  }
}
