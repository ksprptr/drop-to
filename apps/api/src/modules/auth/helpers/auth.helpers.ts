import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
} from '@/common/services/auth-tokens/auth-tokens.constants';
import { RequestUser } from '@/common/types/auth-user.types';
import { type JwtConfig, jwtConfig } from '@/config/jwt.config';

/**
 * Class representing an auth helpers.
 *
 * Signs the stateless access and refresh JWTs. Both carry the same `{ sub }`
 * payload; they differ only in secret and lifetime.
 */
@Injectable()
export class AuthHelpers {
  constructor(
    private readonly jwtService: JwtService,
    @Inject(jwtConfig.KEY) private readonly jwtCfg: JwtConfig,
  ) {}

  /**
   * Helper to sign a short-lived access token.
   * @param payload - The user payload to embed
   * @returns The signed access token
   */
  signAccessToken(payload: RequestUser): Promise<string> {
    return this.jwtService.signAsync(payload, {
      secret: this.jwtCfg.accessSecret,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    });
  }

  /**
   * Helper to sign a longer-lived refresh token.
   * @param payload - The user payload to embed
   * @returns The signed refresh token
   */
  signRefreshToken(payload: RequestUser): Promise<string> {
    return this.jwtService.signAsync(payload, {
      secret: this.jwtCfg.refreshSecret,
      expiresIn: REFRESH_TOKEN_TTL_SECONDS,
    });
  }
}
