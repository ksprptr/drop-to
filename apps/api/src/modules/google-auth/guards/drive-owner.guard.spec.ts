import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';

import { DRIVE_OWNER_COOKIE } from '../google-auth.constants';
import type { GoogleAuthService } from '../google-auth.service';
import { DriveOwnerGuard } from './drive-owner.guard';

/**
 * Builds an ExecutionContext carrying the given parsed cookies.
 **/
const buildContext = (cookies?: Record<string, string>): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ cookies }) as Partial<Request> }),
  }) as unknown as ExecutionContext;

describe('DriveOwnerGuard', () => {
  let googleAuthService: { isVerifiedOwner: jest.Mock };
  let guard: DriveOwnerGuard;

  beforeEach(() => {
    googleAuthService = { isVerifiedOwner: jest.fn().mockResolvedValue(false) };
    guard = new DriveOwnerGuard(googleAuthService as unknown as GoogleAuthService);
  });

  it('allows the request when the cookie proves ownership', async () => {
    googleAuthService.isVerifiedOwner.mockResolvedValue(true);

    await expect(guard.canActivate(buildContext({ [DRIVE_OWNER_COOKIE]: 'proof' }))).resolves.toBe(
      true,
    );
    expect(googleAuthService.isVerifiedOwner).toHaveBeenCalledWith('proof');
  });

  it('rejects when the token does not verify (403)', async () => {
    googleAuthService.isVerifiedOwner.mockResolvedValue(false);

    await expect(
      guard.canActivate(buildContext({ [DRIVE_OWNER_COOKIE]: 'forged' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects when the cookie is absent, without inventing a token', async () => {
    await expect(guard.canActivate(buildContext({}))).rejects.toBeInstanceOf(ForbiddenException);
    expect(googleAuthService.isVerifiedOwner).toHaveBeenCalledWith(undefined);
  });

  it('rejects when no cookies were parsed at all', async () => {
    // cookie-parser not reached (or a request with no Cookie header) must not throw a TypeError —
    // that would surface as a 500 and hide the authorization decision.
    await expect(guard.canActivate(buildContext(undefined))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('does not fall back to allowing when the ownership check itself fails', async () => {
    googleAuthService.isVerifiedOwner.mockRejectedValue(new Error('db down'));

    await expect(
      guard.canActivate(buildContext({ [DRIVE_OWNER_COOKIE]: 'proof' })),
    ).rejects.toThrow('db down');
  });
});
