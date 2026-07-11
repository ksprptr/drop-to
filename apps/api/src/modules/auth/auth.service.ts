import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JsonWebTokenError, JwtService } from '@nestjs/jwt';
import { timingSafeEqual } from 'node:crypto';

import { JwtRequestUser } from '@/common/types/auth-user.types';
import { type AuthConfig, authConfig } from '@/config/auth.config';
import { type JwtConfig, jwtConfig } from '@/config/jwt.config';

import { LoginDto } from './dto/login.dto';
import { AuthResponseEntity } from './entities/auth-response.entity';
import { AuthHelpers } from './helpers/auth.helpers';

/**
 * Class representing an auth service.
 *
 * Authenticates the single operator account defined in the environment and
 * issues stateless access/refresh JWTs. There is no user database — the refresh
 * token is a signed JWT, so logout is handled by clearing the cookies client-side.
 */
@Injectable()
export class AuthService {
  constructor(
    @Inject(authConfig.KEY) private readonly authCfg: AuthConfig,
    @Inject(jwtConfig.KEY) private readonly jwtCfg: JwtConfig,
    private readonly jwtService: JwtService,
    private readonly authHelpers: AuthHelpers,
  ) {}

  /**
   * Function to authenticate the operator and issue a fresh token pair.
   * @param loginDto - The submitted username and password
   * @returns The access and refresh tokens
   * @throws UnauthorizedException on invalid credentials
   */
  async login(loginDto: LoginDto): Promise<AuthResponseEntity> {
    const usernameOk = this.safeEqual(loginDto.username, this.authCfg.username);
    const passwordOk = this.safeEqual(loginDto.password, this.authCfg.password);

    // Evaluate both before deciding so timing does not reveal which field was wrong.
    if (!usernameOk || !passwordOk) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    return this.issueTokens();
  }

  /**
   * Function to rotate the token pair from a valid refresh token.
   * @param rawRefreshToken - The refresh token from the cookie
   * @returns A new access and refresh token pair
   * @throws UnauthorizedException when the refresh token is missing, invalid or expired
   */
  async refreshTokens(rawRefreshToken: string | null): Promise<AuthResponseEntity> {
    if (!rawRefreshToken) {
      throw new UnauthorizedException('Missing refresh token.');
    }

    try {
      const payload: JwtRequestUser = await this.jwtService.verifyAsync(rawRefreshToken, {
        secret: this.jwtCfg.refreshSecret,
      });

      // The single operator is the only valid subject; reject anything else.
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

  /**
   * Function to sign a fresh access/refresh token pair for the operator.
   * @returns The token pair
   */
  private async issueTokens(): Promise<AuthResponseEntity> {
    const payload = { sub: this.authCfg.username };

    const [accessToken, refreshToken] = await Promise.all([
      this.authHelpers.signAccessToken(payload),
      this.authHelpers.signRefreshToken(payload),
    ]);

    return { accessToken, refreshToken };
  }

  /**
   * Constant-time string comparison that never short-circuits on length.
   * @param provided - The value from the request
   * @param expected - The configured value
   * @returns True when the two are equal
   */
  private safeEqual(provided: string, expected: string): boolean {
    const providedBuffer = Buffer.from(provided);
    const expectedBuffer = Buffer.from(expected);

    return (
      providedBuffer.length === expectedBuffer.length &&
      timingSafeEqual(providedBuffer, expectedBuffer)
    );
  }
}
