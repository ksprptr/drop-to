import { CanActivate, Inject, Injectable, NotFoundException } from '@nestjs/common';

import { type GoogleConfig, googleConfig } from '@/config/google.config';

/**
 * Hides the whole Google OAuth surface when `GOOGLE_ENABLED` is off — every route 404s as if it did not exist.
 **/
@Injectable()
export class GoogleEnabledGuard implements CanActivate {
  constructor(@Inject(googleConfig.KEY) private readonly googleCfg: GoogleConfig) {}

  canActivate(): boolean {
    if (!this.googleCfg.enabled) {
      throw new NotFoundException('Google Drive storage is not enabled.');
    }

    return true;
  }
}
