import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JsonWebTokenError, JwtService } from '@nestjs/jwt';
import { timingSafeEqual } from 'node:crypto';

import { REFRESH_TOKEN_TTL_SECONDS } from '@/common/services/auth-tokens/auth-tokens.constants';
import { RefreshJwtPayload } from '@/common/types/auth-user.types';
import { type AuthConfig, authConfig } from '@/config/auth.config';
import { type JwtConfig, jwtConfig } from '@/config/jwt.config';
import { PrismaService } from '@/prisma/prisma.service';

import { AuthStateService } from './auth-state.service';
import { LoginDto } from './dto/login.dto';
import { AuthResponseEntity } from './entities/auth-response.entity';
import { AuthHelpers } from './helpers/auth.helpers';

interface IssuedSession {
  accessToken: string;
  refreshToken: string;
  refreshTokenId: string;
}

/**
 * Authenticates the single env-defined operator and issues revocable access/refresh tokens.
 * Refresh tokens are rotated on every use and backed by a DB row so reuse is detectable.
 **/
@Injectable()
export class AuthService {
  constructor(
    @Inject(authConfig.KEY) private readonly authCfg: AuthConfig,
    @Inject(jwtConfig.KEY) private readonly jwtCfg: JwtConfig,
    private readonly jwtService: JwtService,
    private readonly authHelpers: AuthHelpers,
    private readonly authStateService: AuthStateService,
    private readonly prismaService: PrismaService,
  ) {}

  async login(loginDto: LoginDto): Promise<AuthResponseEntity> {
    const usernameOk = this.safeEqual(loginDto.username, this.authCfg.username);
    const passwordOk = this.safeEqual(loginDto.password, this.authCfg.password);

    // Evaluate both so timing doesn't reveal which field was wrong.
    if (!usernameOk || !passwordOk) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const session = await this.issueSession(this.authCfg.username);

    return { accessToken: session.accessToken, refreshToken: session.refreshToken };
  }

  /**
   * Rotates the token pair from a valid, non-revoked refresh token. Presenting an already-revoked
   * token (i.e. one that was already rotated) is treated as theft: every session is revoked.
   **/
  async refreshTokens(rawRefreshToken: string | null): Promise<AuthResponseEntity> {
    if (!rawRefreshToken) {
      throw new UnauthorizedException('Missing refresh token.');
    }

    let payload: RefreshJwtPayload;
    try {
      payload = await this.jwtService.verifyAsync(rawRefreshToken, {
        secret: this.jwtCfg.refreshSecret,
        algorithms: ['HS256'],
      });
    } catch (error) {
      if (error instanceof JsonWebTokenError) {
        throw new UnauthorizedException('Invalid or expired refresh token.');
      }
      throw error;
    }

    const currentVersion = await this.authStateService.getTokenVersion();
    if (payload.sub !== this.authCfg.username || payload.ver !== currentVersion || !payload.jti) {
      throw new UnauthorizedException('Invalid refresh token.');
    }

    const record = await this.prismaService.refreshToken.findUnique({ where: { id: payload.jti } });

    // Unknown id → the token was never issued or has already been pruned after expiry.
    if (!record) {
      throw new UnauthorizedException('Invalid refresh token.');
    }

    // A revoked row means this token was already rotated — replaying it signals theft.
    if (record.revokedAt) {
      await this.revokeAllForSubject(payload.sub);
      throw new UnauthorizedException('Refresh token reuse detected; all sessions were revoked.');
    }

    if (record.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Invalid or expired refresh token.');
    }

    const session = await this.issueSession(payload.sub);
    await this.prismaService.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date(), replacedByTokenId: session.refreshTokenId },
    });

    await this.pruneExpired();

    return { accessToken: session.accessToken, refreshToken: session.refreshToken };
  }

  /**
   * Logs out by revoking the presented refresh token's row and bumping the token version (so the
   * still-valid access token is invalidated too). Only acts on a valid, current refresh token, so
   * an anonymous caller can't force a logout.
   **/
  async logout(rawRefreshToken: string | null): Promise<void> {
    if (!rawRefreshToken) {
      return;
    }

    try {
      const payload: RefreshJwtPayload = await this.jwtService.verifyAsync(rawRefreshToken, {
        secret: this.jwtCfg.refreshSecret,
        algorithms: ['HS256'],
      });

      const currentVersion = await this.authStateService.getTokenVersion();

      if (payload.sub === this.authCfg.username && payload.ver === currentVersion) {
        if (payload.jti) {
          await this.prismaService.refreshToken.updateMany({
            where: { id: payload.jti, revokedAt: null },
            data: { revokedAt: new Date() },
          });
        }
        await this.authStateService.bumpTokenVersion();
      }
    } catch {
      // An invalid/expired refresh token has nothing to revoke — clearing cookies is enough.
    }
  }

  /**
   * Creates a refresh-token row and signs the matching access + refresh JWTs (the refresh JWT
   * carries the row id as its `jti`).
   **/
  private async issueSession(subject: string): Promise<IssuedSession> {
    const ver = await this.authStateService.getTokenVersion();
    const record = await this.prismaService.refreshToken.create({
      data: { subject, expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000) },
    });

    const [accessToken, refreshToken] = await Promise.all([
      this.authHelpers.signAccessToken({ sub: subject, ver }),
      this.authHelpers.signRefreshToken({ sub: subject, ver, jti: record.id }),
    ]);

    return { accessToken, refreshToken, refreshTokenId: record.id };
  }

  /**
   * Theft response: revoke every live session for the subject and bump the token version so all
   * outstanding access tokens die immediately.
   **/
  private async revokeAllForSubject(subject: string): Promise<void> {
    await this.prismaService.refreshToken.updateMany({
      where: { subject, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.authStateService.bumpTokenVersion();
  }

  /**
   * Prunes expired rows so the table stays bounded (revoked-but-unexpired rows are kept so reuse
   * of a still-valid token is still detectable).
   **/
  private async pruneExpired(): Promise<void> {
    await this.prismaService.refreshToken.deleteMany({ where: { expiresAt: { lt: new Date() } } });
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
