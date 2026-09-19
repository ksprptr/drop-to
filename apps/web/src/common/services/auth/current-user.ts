import 'server-only';
import type { AuthUser } from '@dropto/types';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';

import {
  REAUTH_GUARD_COOKIE,
  REAUTH_PARAM,
  REQUEST_URL_HEADER,
  SESSION_EXPIRED_REASON,
} from '@/common/constants/auth.constants';
import { getMe } from '@/common/services/api/auth.api';
import { isApiFailure, isUnauthorizedError } from '@/common/utils/error.functions';

/**
 * The current URL with the re-auth flag appended, so the proxy refreshes and bounces straight back.
 **/
const reauthTarget = (requestUrl: string | null): string => {
  const url = new URL(requestUrl ?? '/', 'http://localhost');
  url.searchParams.set(REAUTH_PARAM, '1');

  return `${url.pathname}${url.search}`;
};

/**
 * Current operator (per-request cached); recovers a rejected token, ends the session only when it cannot.
 **/
export const getCurrentUser = cache(async (): Promise<AuthUser> => {
  try {
    return await getMe();
  } catch (error) {
    if (!isApiFailure(error)) {
      throw error;
    }

    if (!isUnauthorizedError(error)) {
      console.warn('[auth] session probe failed, keeping the session:', error);
      return { authenticated: true };
    }

    const [cookieStore, headersList] = await Promise.all([cookies(), headers()]);

    if (cookieStore.get(REAUTH_GUARD_COOKIE)) {
      redirect(`/login?reason=${SESSION_EXPIRED_REASON}`);
    }

    redirect(reauthTarget(headersList.get(REQUEST_URL_HEADER)));
  }
});
