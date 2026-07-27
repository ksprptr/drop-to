import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JsonWebTokenError, JwtService } from '@nestjs/jwt';

import { type JwtConfig } from '@/config/jwt.config';
import type { PrismaService } from '@/prisma/prisma.service';

import { AuthGuard } from './auth.guard';

/**
 * Builds a minimal ExecutionContext exposing the given cookie header.
 **/
const buildContext = (cookieHeader?: string): { context: ExecutionContext; request: { user?: unknown } } => {
  const request: { headers: Record<string, unknown>; user?: unknown } = {
    headers: cookieHeader ? { cookie: cookieHeader } : {},
  };

  const context = {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;

  return { context, request };
};

describe('AuthGuard', () => {
  let reflector: Reflector;
  let jwtService: { verifyAsync: jest.Mock };
  let prisma: { authState: { findUnique: jest.Mock } };
  let guard: AuthGuard;

  const jwtCfg = { accessSecret: 'access', refreshSecret: 'refresh' } as JwtConfig;

  beforeEach(() => {
    reflector = new Reflector();
    jwtService = { verifyAsync: jest.fn() };
    prisma = { authState: { findUnique: jest.fn().mockResolvedValue(null) } };
    guard = new AuthGuard(
      reflector,
      jwtService as unknown as JwtService,
      jwtCfg,
      prisma as unknown as PrismaService,
    );
  });

  it('allows a public route without checking the token', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

    await expect(guard.canActivate(buildContext().context)).resolves.toBe(true);
    expect(jwtService.verifyAsync).not.toHaveBeenCalled();
  });

  it('allows a request with a valid, current-version access token and attaches the user', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    jwtService.verifyAsync.mockResolvedValue({ sub: 'operator', ver: 0, iat: 1, exp: 2 });

    const { context, request } = buildContext('accessToken=valid.jwt.token');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual({ sub: 'operator' });
  });

  it('rejects a signature-valid token whose version was revoked', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    jwtService.verifyAsync.mockResolvedValue({ sub: 'operator', ver: 0, iat: 1, exp: 2 });
    prisma.authState.findUnique.mockResolvedValue({ tokenVersion: 1 });

    await expect(
      guard.canActivate(buildContext('accessToken=stale').context),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a request without an access cookie', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

    await expect(guard.canActivate(buildContext().context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects an expired access token', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    const expired = new JsonWebTokenError('jwt expired');
    expired.name = 'TokenExpiredError';
    jwtService.verifyAsync.mockRejectedValue(expired);

    await expect(guard.canActivate(buildContext('accessToken=expired').context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a malformed access token', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    jwtService.verifyAsync.mockRejectedValue(new JsonWebTokenError('invalid signature'));

    await expect(guard.canActivate(buildContext('accessToken=garbage').context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
