import { UnauthorizedException } from '@nestjs/common';
import { JsonWebTokenError, JwtService } from '@nestjs/jwt';

import { type AuthConfig } from '@/config/auth.config';
import { type JwtConfig } from '@/config/jwt.config';
import { PrismaService } from '@/prisma/prisma.service';

import { AuthService } from './auth.service';
import { AuthStateService } from './auth-state.service';
import { AuthHelpers } from './helpers/auth.helpers';

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: { verifyAsync: jest.Mock };
  let authHelpers: { signAccessToken: jest.Mock; signRefreshToken: jest.Mock };
  let authState: { getTokenVersion: jest.Mock; bumpTokenVersion: jest.Mock };
  let prisma: {
    refreshToken: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      deleteMany: jest.Mock;
    };
  };

  const authCfg = { username: 'operator', password: 'secret', cookieDomain: undefined } as AuthConfig;
  const jwtCfg = { accessSecret: 'access', refreshSecret: 'refresh' } as JwtConfig;

  const liveRow = () => ({
    id: 'row-1',
    subject: 'operator',
    revokedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
  });

  beforeEach(() => {
    jwtService = { verifyAsync: jest.fn() };
    authHelpers = {
      signAccessToken: jest.fn().mockResolvedValue('access-token'),
      signRefreshToken: jest.fn().mockResolvedValue('refresh-token'),
    };
    authState = {
      getTokenVersion: jest.fn().mockResolvedValue(0),
      bumpTokenVersion: jest.fn().mockResolvedValue(undefined),
    };
    prisma = {
      refreshToken: {
        create: jest.fn().mockResolvedValue({ id: 'row-2' }),
        findUnique: jest.fn().mockResolvedValue(liveRow()),
        update: jest.fn().mockResolvedValue(undefined),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };

    service = new AuthService(
      authCfg,
      jwtCfg,
      jwtService as unknown as JwtService,
      authHelpers as unknown as AuthHelpers,
      authState as unknown as AuthStateService,
      prisma as unknown as PrismaService,
    );
  });

  describe('login', () => {
    it('issues a token pair (backed by a new refresh row) for valid credentials', async () => {
      await expect(service.login({ username: 'operator', password: 'secret' })).resolves.toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });
      expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
      expect(authHelpers.signRefreshToken).toHaveBeenCalledWith(
        expect.objectContaining({ sub: 'operator', jti: 'row-2' }),
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
    it('rotates the pair from a valid, current token and revokes the old row', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 'operator', ver: 0, jti: 'row-1' });

      await expect(service.refreshTokens('valid-refresh')).resolves.toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });
      // Old row marked revoked and linked to its replacement; expired rows pruned.
      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'row-1' },
        data: { revokedAt: expect.any(Date), replacedByTokenId: 'row-2' },
      });
      expect(prisma.refreshToken.deleteMany).toHaveBeenCalled();
    });

    it('rejects a missing refresh token', async () => {
      await expect(service.refreshTokens(null)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a refresh token whose subject is not the operator', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 'someone-else', ver: 0, jti: 'row-1' });

      await expect(service.refreshTokens('valid-refresh')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects a refresh token whose version was revoked', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 'operator', ver: 0, jti: 'row-1' });
      authState.getTokenVersion.mockResolvedValue(3);

      await expect(service.refreshTokens('stale-refresh')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects an unknown token id (row was pruned / never issued)', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 'operator', ver: 0, jti: 'gone' });
      prisma.refreshToken.findUnique.mockResolvedValue(null);

      await expect(service.refreshTokens('orphan')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.refreshToken.update).not.toHaveBeenCalled();
    });

    it('detects reuse of an already-revoked row and revokes every session', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 'operator', ver: 0, jti: 'row-1' });
      prisma.refreshToken.findUnique.mockResolvedValue({ ...liveRow(), revokedAt: new Date() });

      await expect(service.refreshTokens('reused')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { subject: 'operator', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(authState.bumpTokenVersion).toHaveBeenCalledTimes(1);
    });

    it('rejects an expired row', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 'operator', ver: 0, jti: 'row-1' });
      prisma.refreshToken.findUnique.mockResolvedValue({
        ...liveRow(),
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(service.refreshTokens('expired-row')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects an invalid or expired JWT', async () => {
      jwtService.verifyAsync.mockRejectedValue(new JsonWebTokenError('jwt expired'));

      await expect(service.refreshTokens('expired')).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('revokes the presented row and bumps the token version for a valid, current token', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 'operator', ver: 0, jti: 'row-1' });

      await service.logout('valid-refresh');

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { id: 'row-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(authState.bumpTokenVersion).toHaveBeenCalledTimes(1);
    });

    it('does nothing without a refresh token', async () => {
      await service.logout(null);

      expect(jwtService.verifyAsync).not.toHaveBeenCalled();
      expect(authState.bumpTokenVersion).not.toHaveBeenCalled();
    });

    it('does not bump on an invalid refresh token', async () => {
      jwtService.verifyAsync.mockRejectedValue(new JsonWebTokenError('bad'));

      await service.logout('garbage');

      expect(authState.bumpTokenVersion).not.toHaveBeenCalled();
    });

    it('does not bump when the version is already stale', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 'operator', ver: 0, jti: 'row-1' });
      authState.getTokenVersion.mockResolvedValue(5);

      await service.logout('stale');

      expect(authState.bumpTokenVersion).not.toHaveBeenCalled();
    });
  });
});
