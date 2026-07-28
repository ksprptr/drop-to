import { UnauthorizedException } from '@nestjs/common';

import { type AuthConfig } from '@/config/auth.config';
import { PrismaService } from '@/prisma/prisma.service';

import { AuthService } from './auth.service';
import { AuthStateService } from './auth-state.service';
import { AuthHelpers } from './helpers/auth.helpers';

describe('AuthService', () => {
  let service: AuthService;
  let authHelpers: { signAccessToken: jest.Mock; generateRefreshSecret: jest.Mock; hashToken: jest.Mock };
  let authState: { getTokenVersion: jest.Mock; bumpTokenVersion: jest.Mock };
  let prisma: {
    $transaction: jest.Mock;
    refreshToken: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      deleteMany: jest.Mock;
    };
  };

  const authCfg = { username: 'operator', password: 'secret', cookieDomain: undefined } as AuthConfig;

  const liveRow = () => ({
    id: 'row-1',
    tokenHash: 'hashed',
    subject: 'operator',
    revokedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    sessionExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });

  beforeEach(() => {
    authHelpers = {
      signAccessToken: jest.fn().mockResolvedValue('access-token'),
      generateRefreshSecret: jest.fn().mockReturnValue('raw-secret'),
      hashToken: jest.fn().mockReturnValue('hashed'),
    };
    authState = {
      getTokenVersion: jest.fn().mockResolvedValue(0),
      bumpTokenVersion: jest.fn().mockResolvedValue(undefined),
    };
    prisma = {
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(prisma)),
      refreshToken: {
        create: jest.fn().mockResolvedValue({ id: 'row-2' }),
        findUnique: jest.fn().mockResolvedValue(liveRow()),
        update: jest.fn().mockResolvedValue(undefined),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };

    service = new AuthService(
      authCfg,
      authHelpers as unknown as AuthHelpers,
      authState as unknown as AuthStateService,
      prisma as unknown as PrismaService,
    );
  });

  describe('login', () => {
    it('issues a pair (opaque refresh secret + new row) for valid credentials', async () => {
      await expect(service.login({ username: 'operator', password: 'secret' })).resolves.toEqual({
        accessToken: 'access-token',
        refreshToken: 'raw-secret',
      });
      // Only the hash of the freshly-minted secret is persisted.
      expect(prisma.refreshToken.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ tokenHash: 'hashed', subject: 'operator' }) }),
      );
    });

    it('rejects a wrong username', async () => {
      await expect(
        service.login({ username: 'intruder', password: 'secret' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a wrong password', async () => {
      await expect(
        service.login({ username: 'operator', password: 'nope' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('refreshTokens', () => {
    it('rotates the pair, revoking the old row and inheriting its absolute deadline', async () => {
      const row = liveRow();
      prisma.refreshToken.findUnique.mockResolvedValue(row);

      await expect(service.refreshTokens('raw-refresh')).resolves.toEqual({
        accessToken: 'access-token',
        refreshToken: 'raw-secret',
      });
      // New row inherits the original session deadline (no extension past login + absolute TTL).
      expect(prisma.refreshToken.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ sessionExpiresAt: row.sessionExpiresAt }) }),
      );
      // Old row revoked + linked to its replacement; expired rows pruned.
      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'row-1' },
        data: { revokedAt: expect.any(Date), replacedByTokenId: 'row-2' },
      });
      expect(prisma.refreshToken.deleteMany).toHaveBeenCalled();
    });

    it('rejects a missing refresh token', async () => {
      await expect(service.refreshTokens(null)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects an unknown token (no matching hash)', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);

      await expect(service.refreshTokens('orphan')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.refreshToken.update).not.toHaveBeenCalled();
    });

    it('detects reuse of an already-revoked row and revokes every session', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({ ...liveRow(), revokedAt: new Date() });

      await expect(service.refreshTokens('reused')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { subject: 'operator', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(authState.bumpTokenVersion).toHaveBeenCalledTimes(1);
    });

    it('rejects a token past its sliding idle window', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        ...liveRow(),
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(service.refreshTokens('idle')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a token past the absolute session cap', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        ...liveRow(),
        sessionExpiresAt: new Date(Date.now() - 1000),
      });

      await expect(service.refreshTokens('capped')).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('revokes the presented row and bumps the token version', async () => {
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      await service.logout('raw-refresh');

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { tokenHash: 'hashed', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(authState.bumpTokenVersion).toHaveBeenCalledTimes(1);
    });

    it('does nothing without a refresh token', async () => {
      await service.logout(null);

      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
      expect(authState.bumpTokenVersion).not.toHaveBeenCalled();
    });

    it('does not bump when no live row matched (unknown / already revoked)', async () => {
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 0 });

      await service.logout('stale');

      expect(authState.bumpTokenVersion).not.toHaveBeenCalled();
    });
  });
});
