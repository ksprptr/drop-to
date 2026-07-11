import { UnauthorizedException } from '@nestjs/common';
import { JsonWebTokenError, JwtService } from '@nestjs/jwt';

import { type AuthConfig } from '@/config/auth.config';
import { type JwtConfig } from '@/config/jwt.config';

import { AuthService } from './auth.service';
import { AuthHelpers } from './helpers/auth.helpers';

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: { verifyAsync: jest.Mock };
  let authHelpers: { signAccessToken: jest.Mock; signRefreshToken: jest.Mock };

  const authCfg = { username: 'operator', password: 'secret', cookieDomain: undefined } as AuthConfig;
  const jwtCfg = { accessSecret: 'access', refreshSecret: 'refresh' } as JwtConfig;

  beforeEach(() => {
    jwtService = { verifyAsync: jest.fn() };
    authHelpers = {
      signAccessToken: jest.fn().mockResolvedValue('access-token'),
      signRefreshToken: jest.fn().mockResolvedValue('refresh-token'),
    };

    service = new AuthService(
      authCfg,
      jwtCfg,
      jwtService as unknown as JwtService,
      authHelpers as unknown as AuthHelpers,
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
    it('issues a new token pair from a valid refresh token', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 'operator' });

      await expect(service.refreshTokens('valid-refresh')).resolves.toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });
      expect(jwtService.verifyAsync).toHaveBeenCalledWith('valid-refresh', { secret: 'refresh' });
    });

    it('rejects a missing refresh token', async () => {
      await expect(service.refreshTokens(null)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a refresh token whose subject is not the operator', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 'someone-else' });

      await expect(service.refreshTokens('valid-refresh')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects an invalid or expired refresh token', async () => {
      jwtService.verifyAsync.mockRejectedValue(new JsonWebTokenError('jwt expired'));

      await expect(service.refreshTokens('expired')).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
