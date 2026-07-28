import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
} from '@/common/services/auth-tokens/auth-tokens.constants';
import { AccessTokenPayload, RefreshTokenPayload } from '@/common/types/auth-user.types';
import { type JwtConfig, jwtConfig } from '@/config/jwt.config';

/**
 * Signs the access (`{ sub, ver }`) and refresh (`{ sub, ver, jti }`) JWTs — different
 * secret/lifetime; the refresh token additionally carries the id of its backing DB row.
 **/
@Injectable()
export class AuthHelpers {
  constructor(
    private readonly jwtService: JwtService,
    @Inject(jwtConfig.KEY) private readonly jwtCfg: JwtConfig,
  ) {}

  signAccessToken(payload: AccessTokenPayload): Promise<string> {
    return this.jwtService.signAsync(payload, {
      secret: this.jwtCfg.accessSecret,
      algorithm: 'HS256',
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    });
  }

  signRefreshToken(payload: RefreshTokenPayload): Promise<string> {
    return this.jwtService.signAsync(payload, {
      secret: this.jwtCfg.refreshSecret,
      algorithm: 'HS256',
      expiresIn: REFRESH_TOKEN_TTL_SECONDS,
    });
  }
}
