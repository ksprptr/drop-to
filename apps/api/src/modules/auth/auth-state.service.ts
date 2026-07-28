import { Injectable } from '@nestjs/common';

import { PrismaService } from '@/prisma/prisma.service';

import { AUTH_STATE_ID } from './auth.constants';

/**
 * Owns the operator's token version — the single source of truth for JWT revocation.
 *
 * FUTURE: (multi-user) the version is stored on a single global `AuthState` row, so bumping it
 * revokes tokens for every operator at once. For multiple users, move `tokenVersion` onto a
 * per-user row and key get/bump by user id (the RefreshToken table is already `subject`-keyed).
 **/
@Injectable()
export class AuthStateService {
  constructor(private readonly prismaService: PrismaService) {}

  /**
   * Returns the current token version (0 when never bumped).
   **/
  async getTokenVersion(): Promise<number> {
    const state = await this.prismaService.authState.findUnique({
      where: { id: AUTH_STATE_ID },
      select: { tokenVersion: true },
    });

    return state?.tokenVersion ?? 0;
  }

  /**
   * Increments the token version, revoking every previously issued token.
   **/
  async bumpTokenVersion(): Promise<void> {
    await this.prismaService.authState.upsert({
      where: { id: AUTH_STATE_ID },
      update: { tokenVersion: { increment: 1 } },
      create: { id: AUTH_STATE_ID, tokenVersion: 1 },
    });
  }
}
