import 'server-only';
import type { AuthUser } from '@dropto/types';
import { redirect } from 'next/navigation';
import { cache } from 'react';

import { SESSION_EXPIRED_REASON } from '@/common/constants/auth.constants';
import { getMe } from '@/common/services/api/auth.api';

/**
 * Current operator (per-request cached); redirects to the login page when the session is gone.
 **/
// Deliberately NOT a sign-out: any failure lands here — a 429, a blip, an API restart — and the
// API's logout bumps the global token version, so revoking on one of those would invalidate every
// live access token, including one issued seconds earlier. This only ends the session in this
// browser; the proxy clears the dead cookies on that leg, since a render cannot write them itself.
export const getCurrentUser = cache(async (): Promise<AuthUser> => {
  try {
    return await getMe();
  } catch {
    redirect(`/login?reason=${SESSION_EXPIRED_REASON}`);
  }
});
