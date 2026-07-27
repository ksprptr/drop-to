import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JsonWebTokenError, JwtService } from '@nestjs/jwt';
import { timingSafeEqual } from 'node:crypto';

import { JwtRequestUser } from '@/common/types/auth-user.types';
import { type AuthConfig, authConfig } from '@/config/auth.config';
import { type JwtConfig, jwtConfig } from '@/config/jwt.config';

import { LoginDto } from './dto/login.dto';
import { AuthResponseEntity } from './entities/auth-response.entity';
import { AuthHelpers } from './helpers/auth.helpers';

/** Authenticates the single env-defined operator and issues stateless access/refresh JWTs. */
@Injectable()
export class AuthService {
  constructor(
    @Inject(authConfig.KEY) private readonly authCfg: AuthConfig,
    @Inject(jwtConfig.KEY) private readonly jwtCfg: JwtConfig,
    private readonly jwtService: JwtService,
    private readonly authHelpers: AuthHelpers,
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
   * Rotates the token pair from a valid refresh token.
   **/
  async refreshTokens(rawRefreshToken: string | null): Promise<AuthResponseEntity> {
    if (!rawRefreshToken) {
      throw new UnauthorizedException('Missing refresh token.');
    }

    try {
      const payload: JwtRequestUser = await this.jwtService.verifyAsync(rawRefreshToken, {
        secret: this.jwtCfg.refreshSecret,
      });

      if (payload.sub !== this.authCfg.username) {
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

  private async issueTokens(): Promise<AuthResponseEntity> {
    const payload = { sub: this.authCfg.username };

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
