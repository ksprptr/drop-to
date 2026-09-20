import { NotFoundException } from '@nestjs/common';

import type { GoogleConfig } from '@/config/google.config';

import { GoogleEnabledGuard } from './google-enabled.guard';

/**
 * Builds the guard over a config with the given `enabled` flag.
 **/
const make = (enabled: boolean): GoogleEnabledGuard =>
  new GoogleEnabledGuard({ enabled } as GoogleConfig);

describe('GoogleEnabledGuard', () => {
  it('allows the request when the Drive backend is enabled', () => {
    expect(make(true).canActivate()).toBe(true);
  });

  // The kill-switch must 404, not 403/401: a disabled backend should look like it never existed,
  // so its whole route surface is indistinguishable from an unknown path.
  it('404s when the Drive backend is disabled', () => {
    expect(() => make(false).canActivate()).toThrow(NotFoundException);
  });
});
