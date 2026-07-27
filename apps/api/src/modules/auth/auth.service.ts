import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JsonWebTokenError, JwtService } from '@nestjs/jwt';
import { timingSafeEqual } from 'node:crypto';

import { JwtRequestUser } from '@/common/types/auth-user.types';
import { type AuthConfig, authConfig } from '@/config/auth.config';
import { type JwtConfig, jwtConfig } from '@/config/jwt.config';

import { AuthStateService } from './auth-state.service';
import { LoginDto } from './dto/login.dto';
import { AuthResponseEntity } from './entities/auth-response.entity';
import { AuthHelpers } from './helpers/auth.helpers';

/** Authenticates the single env-defined operator and issues revocable access/refresh JWTs. */
@Injectable()
export class AuthService {
  constructor(
    @Inject(authConfig.KEY) private readonly authCfg: AuthConfig,
    @Inject(jwtConfig.KEY) private readonly jwtCfg: JwtConfig,
    private readonly jwtService: JwtService,
    private readonly authHelpers: AuthHelpers,
    private readonly authStateService: AuthStateService,
  ) {}

  async login(loginDto: LoginDto): Promise<AuthResponseEntity> {
    const usernameOk = this.safeEqual(loginDto.username, this.authCfg.username);
    const passwordOk = this.safeEqual(loginDto.password, this.authCfg.password);

    // Evaluate both so timing doesn't reveal which field was wrong.
    if (!usernameOk || !passwordOk) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    return this.issueTokens();
  }

  /**
   * Rotates the token pair from a valid, non-revoked refresh token.
   **/
  async refreshTokens(rawRefreshToken: string | null): Promise<AuthResponseEntity> {
    if (!rawRefreshToken) {
      throw new UnauthorizedException('Missing refresh token.');
    }

    try {
      const payload: JwtRequestUser = await this.jwtService.verifyAsync(rawRefreshToken, {
        secret: this.jwtCfg.refreshSecret,
        algorithms: ['HS256'],
      });

      const currentVersion = await this.authStateService.getTokenVersion();

      if (payload.sub !== this.authCfg.username || payload.ver !== currentVersion) {
        throw new UnauthorizedException('Invalid refresh token.');
      }

      return this.issueTokens();
    } catch (error) {
      if (error instanceof JsonWebTokenError) {
        throw new UnauthorizedException('Invalid or expired refresh token.');
      }

      throw error;
    }
  }

  /**
   * Revokes the operator's active sessions by bumping the token version, but only when a
   * still-valid refresh token is presented (so an anonymous caller can't force a logout).
   **/
  async logout(rawRefreshToken: string | null): Promise<void> {
    if (!rawRefreshToken) {
      return;
    }

    try {
      const payload: JwtRequestUser = await this.jwtService.verifyAsync(rawRefreshToken, {
        secret: this.jwtCfg.refreshSecret,
        algorithms: ['HS256'],
      });

      const currentVersion = await this.authStateService.getTokenVersion();

      if (payload.sub === this.authCfg.username && payload.ver === currentVersion) {
        await this.authStateService.bumpTokenVersion();
      }
    } catch {
      // An invalid/expired refresh token has nothing to revoke — clearing cookies is enough.
    }
  }

  private async issueTokens(): Promise<AuthResponseEntity> {
    const ver = await this.authStateService.getTokenVersion();
    const payload = { sub: this.authCfg.username, ver };

    const [accessToken, refreshToken] = await Promise.all([
      this.authHelpers.signAccessToken(payload),
      this.authHelpers.signRefreshToken(payload),
    ]);

    return { accessToken, refreshToken };
  }

  /**
   * Constant-time string comparison (also length-safe).
   **/
  private safeEqual(provided: string, expected: string): boolean {
    const providedBuffer = Buffer.from(provided);
    const expectedBuffer = Buffer.from(expected);

    return (
      providedBuffer.length === expectedBuffer.length &&
      timingSafeEqual(providedBuffer, expectedBuffer)
    );
  }
}
