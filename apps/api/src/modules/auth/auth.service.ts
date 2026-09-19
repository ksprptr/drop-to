import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { compare } from 'bcryptjs';
import { Prisma, type RefreshToken } from 'prisma/generated/prisma/client';

import {
  REFRESH_ABSOLUTE_TTL_SECONDS,
  REFRESH_REUSE_GRACE_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
} from '@/common/services/auth-tokens/auth-tokens.constants';
import { type AuthConfig, authConfig } from '@/config/auth.config';
import { PrismaService } from '@/prisma/prisma.service';

import { OPERATOR_SUBJECT } from './auth.constants';
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
 * Authenticates the single env-defined operator with rotating, reuse-detected refresh tokens.
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
    // bcrypt.compare re-derives the hash with the stored cost/salt, so a wrong password costs the same.
    const passwordOk = await compare(loginDto.password, this.authCfg.passwordHash);

    if (!passwordOk) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const session = await this.issueSession(OPERATOR_SUBJECT);

    return { accessToken: session.accessToken, refreshToken: session.refreshToken };
  }

  /**
   * Rotates the token pair from a valid refresh token; replaying a revoked one is treated as theft.
   **/
  async refreshTokens(rawRefreshToken: string | null): Promise<AuthResponseEntity> {
    if (!rawRefreshToken) {
      throw new UnauthorizedException('Missing refresh token.');
    }

    const tokenHash = this.authHelpers.hashToken(rawRefreshToken);
    const presented = await this.prismaService.refreshToken.findUnique({ where: { tokenHash } });

    if (!presented) {
      throw new UnauthorizedException('Invalid refresh token.');
    }

    // A revoked row usually means theft — but not always; `resolveReplay` tells the two apart.
    const existing = presented.revokedAt ? await this.resolveReplay(presented) : presented;

    // Reject once the sliding idle window OR the absolute session cap has passed.
    const now = Date.now();
    if (existing.expiresAt.getTime() <= now || existing.sessionExpiresAt.getTime() <= now) {
      throw new UnauthorizedException('Invalid or expired refresh token.');
    }

    // Rotate atomically: new row inherits the absolute deadline, old row revoked + linked, no overlap.
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
   * Tells a concurrent refresh apart from a genuine replay, returning the row to rotate from.
   **/
  // Rotation is not atomic across clients: the web collapses parallel refreshes in one process's
  // memory, which does not survive a restart and is not shared between replicas, so two requests
  // can present the same token moments apart. Treating that as theft is expensive here — every
  // session is issued to the same subject, so `revokeAllForSubject` signs out everyone who happens
  // to be using the app. Inside the grace window, a replay whose replacement is still live is
  // therefore continued from that replacement instead: the chain moves on, nobody is signed out,
  // and a real replay (late, or of a chain already revoked) still gets the full theft response.
  private async resolveReplay(presented: RefreshToken): Promise<RefreshToken> {
    const revokedAgoMs = Date.now() - (presented.revokedAt?.getTime() ?? 0);

    const replacement =
      revokedAgoMs <= REFRESH_REUSE_GRACE_SECONDS * 1000 && presented.replacedByTokenId
        ? await this.prismaService.refreshToken.findUnique({
            where: { id: presented.replacedByTokenId },
          })
        : null;

    if (!replacement || replacement.revokedAt) {
      await this.revokeAllForSubject(presented.subject);
      throw new UnauthorizedException('Refresh token reuse detected; all sessions were revoked.');
    }

    return replacement;
  }

  /**
   * Revokes the presented refresh token's row and bumps the token version; a no-op for unknown tokens.
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
   * Mints a refresh secret + its row and signs the access JWT; on rotation inherits the original deadline.
   **/
  private async issueSession(
    subject: string,
    sessionExpiresAt?: Date,
    tx?: Prisma.TransactionClient,
  ): Promise<IssuedSession> {
    const db = tx ?? this.prismaService;
    const rawRefreshToken = this.authHelpers.generateRefreshSecret();

    const now = Date.now();
    const absoluteExpiry = sessionExpiresAt ?? new Date(now + REFRESH_ABSOLUTE_TTL_SECONDS * 1000);
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
   * Theft response: revoke every live session for the subject and bump the token version.
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
   * Prunes rows past their idle window (revoked-but-unexpired rows are kept for reuse detection).
   **/
  private async pruneExpired(): Promise<void> {
    // FUTURE: (multi-user scale) pruning opportunistically on every refresh is fine for one
    // operator; with many users move this to a scheduled job (e.g. @nestjs/schedule) so the table
    // is swept independently of request traffic and abandoned sessions are cleaned up too.
    await this.prismaService.refreshToken.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  }
}
