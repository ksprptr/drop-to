import { Injectable } from '@nestjs/common';

import { PrismaService } from '@/prisma/prisma.service';

import { AUTH_STATE_ID } from './auth.constants';

/**
 * Owns the operator's token version — the single source of truth for JWT revocation.
 * Reads are lock-free (default 0 until the first bump); a logout bumps it, invalidating
 * every token issued with the previous version.
 */
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
