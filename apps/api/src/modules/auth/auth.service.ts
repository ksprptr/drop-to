import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { Prisma } from 'prisma/generated/prisma/client';

import {
  REFRESH_ABSOLUTE_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
} from '@/common/services/auth-tokens/auth-tokens.constants';
import { type AuthConfig, authConfig } from '@/config/auth.config';
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
 * Authenticates the single env-defined operator. Access is a short-lived JWT; the refresh token is
 * an opaque secret stored (hashed) in `RefreshToken`, rotated on every use with reuse detection and
 * an absolute session cap.
 **/
@Injectable()
export class AuthService {
  constructor(
    @Inject(authConfig.KEY) private readonly authCfg: AuthConfig,
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

    const tokenHash = this.authHelpers.hashToken(rawRefreshToken);
    const existing = await this.prismaService.refreshToken.findUnique({ where: { tokenHash } });

    if (!existing) {
      throw new UnauthorizedException('Invalid refresh token.');
    }

    // A revoked row means this token was already rotated — replaying it signals theft.
    if (existing.revokedAt) {
      await this.revokeAllForSubject(existing.subject);
      throw new UnauthorizedException('Refresh token reuse detected; all sessions were revoked.');
    }

    // Reject once the sliding idle window OR the absolute session cap has passed.
    const now = Date.now();
    if (existing.expiresAt.getTime() <= now || existing.sessionExpiresAt.getTime() <= now) {
      throw new UnauthorizedException('Invalid or expired refresh token.');
    }

    // Rotate atomically: the new row inherits the original absolute deadline, and the old row is
    // revoked + linked to its replacement in the same transaction (no window where both are live).
    const session = await this.prismaService.$transaction(async (tx) => {
      const issued = await this.issueSession(existing.subject, existing.sessionExpiresAt, tx);
      await tx.refreshToken.update({
        where: { id: existing.id },
        data: { revokedAt: new Date(), replacedByTokenId: issued.refreshTokenId },
      });
      return issued;
    });

    await this.pruneExpired();

    return { accessToken: session.accessToken, refreshToken: session.refreshToken };
  }

  /**
   * Logs out by revoking the presented refresh token's row and bumping the token version (so the
   * still-valid access token is invalidated too). A no-op for an unknown/already-revoked token, so
   * an anonymous caller can't force a logout.
   **/
  async logout(rawRefreshToken: string | null): Promise<void> {
    if (!rawRefreshToken) {
      return;
    }

    const tokenHash = this.authHelpers.hashToken(rawRefreshToken);
    const { count } = await this.prismaService.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    if (count > 0) {
      await this.authStateService.bumpTokenVersion();
    }
  }

  /**
   * Mints a refresh secret + its row and signs the matching access JWT. On a fresh login the
   * absolute session window starts now; on rotation the caller passes the original deadline so the
   * session can't be extended past it.
   **/
  private async issueSession(
    subject: string,
    sessionExpiresAt?: Date,
    tx?: Prisma.TransactionClient,
  ): Promise<IssuedSession> {
    const db = tx ?? this.prismaService;
    const rawRefreshToken = this.authHelpers.generateRefreshSecret();

    const now = Date.now();
    const absoluteExpiry =
      sessionExpiresAt ?? new Date(now + REFRESH_ABSOLUTE_TTL_SECONDS * 1000);
    const idleExpiry = new Date(now + REFRESH_TOKEN_TTL_SECONDS * 1000);
    // The idle window slides forward each rotation but never past the absolute deadline.
    const expiresAt = idleExpiry < absoluteExpiry ? idleExpiry : absoluteExpiry;

    const ver = await this.authStateService.getTokenVersion();
    const record = await db.refreshToken.create({
      data: {
        tokenHash: this.authHelpers.hashToken(rawRefreshToken),
        subject,
        expiresAt,
        sessionExpiresAt: absoluteExpiry,
      },
      select: { id: true },
    });

    const accessToken = await this.authHelpers.signAccessToken({ sub: subject, ver });

    return { accessToken, refreshToken: rawRefreshToken, refreshTokenId: record.id };
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
    // FUTURE: (multi-user) `bumpTokenVersion` is global (single-row AuthState), so it revokes access
    // tokens for EVERY user. When there are multiple operators, make the token version per-user
    // (e.g. a `tokenVersion` column on a User row) and bump only this subject's.
    await this.authStateService.bumpTokenVersion();
  }

  /**
   * Prunes rows past their idle window so the table stays bounded (revoked-but-unexpired rows are
   * kept so reuse of a still-valid token is still detectable).
   **/
  private async pruneExpired(): Promise<void> {
    // FUTURE: (multi-user scale) pruning opportunistically on every refresh is fine for one
    // operator; with many users move this to a scheduled job (e.g. @nestjs/schedule) so the table
    // is swept independently of request traffic and abandoned sessions are cleaned up too.
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
