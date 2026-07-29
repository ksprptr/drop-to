import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';

import { ACCESS_TOKEN_TTL_SECONDS } from '@/common/services/auth-tokens/auth-tokens.constants';
import { AccessTokenPayload } from '@/common/types/auth-user.types';
import { type JwtConfig, jwtConfig } from '@/config/jwt.config';

/**
 * Signs the short-lived access JWT and mints/hashes the opaque refresh secret (never a JWT).
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
   * Hashes a refresh-token secret for storage/lookup; only the hash is ever persisted.
   **/
  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
