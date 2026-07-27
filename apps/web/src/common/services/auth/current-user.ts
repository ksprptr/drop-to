import 'server-only';
import type { AuthUser } from '@dropto/types';
import { redirect } from 'next/navigation';
import { cache } from 'react';

import { getMe } from '@/common/services/api/auth.api';

/**
 * Current operator (per-request cached); redirects to /logout when the session is gone.
 **/
export const getCurrentUser = cache(async (): Promise<AuthUser> => {
  try {
    return await getMe();
  } catch {
    redirect('/logout');
  }
});
