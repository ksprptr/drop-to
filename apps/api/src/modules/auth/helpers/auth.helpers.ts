import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';

import { ACCESS_TOKEN_TTL_SECONDS } from '@/common/services/auth-tokens/auth-tokens.constants';
import { AccessTokenPayload } from '@/common/types/auth-user.types';
import { type JwtConfig, jwtConfig } from '@/config/jwt.config';

/**
 * Token helpers: signs the short-lived access JWT and mints/hashes the opaque refresh secret.
 * The refresh token is never a JWT — only its SHA-256 hash is persisted (see `RefreshToken`).
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

  /**
   * Mints a new opaque refresh-token secret (the raw value handed to the cookie).
   **/
  generateRefreshSecret(): string {
    return randomBytes(48).toString('base64url');
  }

  /**
   * Hashes a refresh-token secret for storage/lookup. Only the hash is ever persisted; the raw
   * value lives only in the cookie.
   **/
  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
