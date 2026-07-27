import { UnauthorizedException } from '@nestjs/common';
import { JsonWebTokenError, JwtService } from '@nestjs/jwt';

import { type AuthConfig } from '@/config/auth.config';
import { type JwtConfig } from '@/config/jwt.config';

import { AuthService } from './auth.service';
import { AuthStateService } from './auth-state.service';
import { AuthHelpers } from './helpers/auth.helpers';

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: { verifyAsync: jest.Mock };
  let authHelpers: { signAccessToken: jest.Mock; signRefreshToken: jest.Mock };
  let authState: { getTokenVersion: jest.Mock; bumpTokenVersion: jest.Mock };

  const authCfg = { username: 'operator', password: 'secret', cookieDomain: undefined } as AuthConfig;
  const jwtCfg = { accessSecret: 'access', refreshSecret: 'refresh' } as JwtConfig;

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

    service = new AuthService(
      authCfg,
      jwtCfg,
      jwtService as unknown as JwtService,
      authHelpers as unknown as AuthHelpers,
      authState as unknown as AuthStateService,
    );
  });

  describe('login', () => {
    it('issues a token pair for valid credentials', async () => {
      await expect(service.login({ username: 'operator', password: 'secret' })).resolves.toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });
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
    it('issues a new token pair from a valid, current-version refresh token', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 'operator', ver: 0 });

      await expect(service.refreshTokens('valid-refresh')).resolves.toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });
      expect(jwtService.verifyAsync).toHaveBeenCalledWith('valid-refresh', {
        secret: 'refresh',
        algorithms: ['HS256'],
      });
    });

    it('rejects a missing refresh token', async () => {
      await expect(service.refreshTokens(null)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a refresh token whose subject is not the operator', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 'someone-else', ver: 0 });

      await expect(service.refreshTokens('valid-refresh')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects a refresh token whose version was revoked', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 'operator', ver: 0 });
      authState.getTokenVersion.mockResolvedValue(3);

      await expect(service.refreshTokens('stale-refresh')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects an invalid or expired refresh token', async () => {
      jwtService.verifyAsync.mockRejectedValue(new JsonWebTokenError('jwt expired'));

      await expect(service.refreshTokens('expired')).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('bumps the token version for a valid, current refresh token', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 'operator', ver: 0 });

      await service.logout('valid-refresh');

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
      jwtService.verifyAsync.mockResolvedValue({ sub: 'operator', ver: 0 });
      authState.getTokenVersion.mockResolvedValue(5);

      await service.logout('stale');

      expect(authState.bumpTokenVersion).not.toHaveBeenCalled();
    });
  });
});
