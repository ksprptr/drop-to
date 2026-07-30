import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';

import { DRIVE_OWNER_COOKIE } from '../google-auth.constants';
import { GoogleAuthService } from '../google-auth.service';

/**
 * Restricts Drive-account management to whoever proved control of the connected Google account.
 **/
@Injectable()
export class DriveOwnerGuard implements CanActivate {
  constructor(private readonly googleAuthService: GoogleAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = (request.cookies as Record<string, string> | undefined)?.[DRIVE_OWNER_COOKIE];

    if (!(await this.googleAuthService.isVerifiedOwner(token))) {
      throw new ForbiddenException(
        'Only the connected Drive account owner can manage it. Verify with Google first.',
      );
    }

    return true;
  }
}
