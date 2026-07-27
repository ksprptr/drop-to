import 'server-only';
import type { AuthUser } from '@dropto/types';
import { redirect } from 'next/navigation';
import { cache } from 'react';

import { getMe } from '@/common/services/api/auth.api';

/**
 * Resolves the current operator once per request (React `cache` dedupes concurrent
 * calls in the same render). If the session is gone (`/auth/me` 401s), bounce to
 * `/logout` to clear stale cookies and land on login, rather than letting a raw
 * axios 401 bubble out of a page as an unhandled render error.
 * @returns The authenticated operator
 */
export const getCurrentUser = cache(async (): Promise<AuthUser> => {
  try {
    return await getMe();
  } catch {
    redirect('/logout');
  }
});
