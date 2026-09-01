import 'server-only';
import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';

import {
  ACCESS_EXP_SKEW_MS,
  ACCESS_TOKEN_COOKIE,
  OAUTH_STATE_COOKIE,
  REFRESH_TOKEN_COOKIE,
} from '@/common/constants/auth.constants';
import { refreshSession } from '@/common/services/auth/refresh.server';
import {
  applyAuthCookies,
  type CookieWriter,
  type ParsedSetCookie,
} from '@/common/services/auth/tokens.server';
import { forwardedForHeader } from '@/common/utils/client-ip.functions';
import { isAccessTokenFresh } from '@/common/utils/jwt.functions';
import { appServerConfig } from '@/configs/app/app.server-config';

/**
 * Absolute API URL for a route-handler passthrough.
 **/
export const apiUrl = (path: string): string => `${appServerConfig.urls.apiUrl}${path}`;

export interface PassthroughSession {
  cookieHeader: string | null;
  rotated: ParsedSetCookie[];
}

/**
 * Resolves the session for a streaming route handler, refreshing up front since these bypass the proxy's proactive refresh.
 **/
export const resolveSessionForPassthrough = async (): Promise<PassthroughSession> => {
  const cookieStore = await cookies();
  let accessValue = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
  let refreshValue = cookieStore.get(REFRESH_TOKEN_COOKIE)?.value;
  let rotated: ParsedSetCookie[] = [];

  if (refreshValue && !isAccessTokenFresh(accessValue, ACCESS_EXP_SKEW_MS)) {
    try {
      rotated = await refreshSession({ refreshToken: refreshValue });
      for (const { name, value } of rotated) {
        if (name === ACCESS_TOKEN_COOKIE) accessValue = value;
        if (name === REFRESH_TOKEN_COOKIE) refreshValue = value;
      }
    } catch {
      // Refresh failed — fall through with the stale token; the API returns 401 and the client re-authenticates.
      rotated = [];
    }
  }

  const parts: string[] = [];
  if (accessValue) parts.push(`${ACCESS_TOKEN_COOKIE}=${accessValue}`);
  if (refreshValue) parts.push(`${REFRESH_TOKEN_COOKIE}=${refreshValue}`);

  return { cookieHeader: parts.length > 0 ? parts.join('; ') : null, rotated };
};

/**
 * Passthrough request headers to the API: forwards session cookies and the client IP.
 **/
export const apiAuthHeaders = async (
  base?: HeadersInit,
  cookieHeader?: string,
): Promise<Headers> => {
  const headersList = await headers();
  const result = new Headers(base);

  if (cookieHeader === undefined) {
    const cookieStore = await cookies();
    const parts: string[] = [];
    for (const name of [ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE]) {
      const value = cookieStore.get(name)?.value;
      if (value) {
        parts.push(`${name}=${value}`);
      }
    }
    if (parts.length > 0) {
      result.set('cookie', parts.join('; '));
    }
  } else if (cookieHeader) {
    result.set('cookie', cookieHeader);
  }

  const forwardedFor = forwardedForHeader(headersList);
  if (forwardedFor) {
    result.set('x-forwarded-for', forwardedFor);
  }

  return result;
};

/** Lifetime of the re-emitted OAuth `state` cookie — mirrors the API's own 10 minutes. */
const OAUTH_STATE_MAX_AGE_S = 10 * 60;

const DOWNLOAD_HEADERS = ['content-type', 'content-disposition', 'content-length', 'accept-ranges'];

/**
 * Streams a GET download from the API back to the browser, forwarding key headers and rotated cookies.
 **/
export const proxyDownload = async (path: string, signal: AbortSignal): Promise<NextResponse> => {
  const session = await resolveSessionForPassthrough();
  const apiResponse = await fetch(apiUrl(path), {
    headers: await apiAuthHeaders(undefined, session.cookieHeader ?? undefined),
    signal,
  });

  const outHeaders = new Headers();
  for (const name of DOWNLOAD_HEADERS) {
    const value = apiResponse.headers.get(name);
    if (value) {
      outHeaders.set(name, value);
    }
  }

  const response = new NextResponse(apiResponse.body, {
    status: apiResponse.status,
    headers: outHeaders,
  });
  applyAuthCookies(response.cookies, session.rotated);

  return response;
};

interface OAuthDestination {
  url: URL;
  cookies?: { name: string; value: string; options: Parameters<CookieWriter['set']>[2] }[];
}

interface OAuthRedirectOptions {
  cookieHeader: string | null;
  isAllowedTarget?: (target: URL) => boolean;
  rebaseOn?: string;
  transformDestination?: (destination: URL) => OAuthDestination;
  fallbackUrl: string;
  unauthorizedUrl: string;
  rotated?: ParsedSetCookie[];
}

/**
 * Runs one leg of the Google OAuth handshake through this origin instead of the API's.
 **/
export const proxyOAuthLeg = async (
  path: string,
  {
    cookieHeader,
    isAllowedTarget,
    rebaseOn,
    transformDestination,
    fallbackUrl,
    unauthorizedUrl,
    rotated = [],
  }: OAuthRedirectOptions,
): Promise<NextResponse> => {
  let apiResponse: Response;

  try {
    apiResponse = await fetch(apiUrl(path), {
      headers: await apiAuthHeaders(undefined, cookieHeader ?? undefined),
      redirect: 'manual',
    });
  } catch {
    return NextResponse.redirect(`${fallbackUrl}?error=api_unreachable`);
  }

  if (apiResponse.status === 401 || apiResponse.status === 403) {
    return NextResponse.redirect(unauthorizedUrl);
  }

  const location = apiResponse.headers.get('location');
  let target: URL | null = null;

  try {
    target = location ? new URL(location) : null;
  } catch {
    target = null;
  }

  if (!target) {
    return NextResponse.redirect(`${fallbackUrl}?error=oauth_failed`);
  }

  const destination = rebaseOn
    ? new URL(`${target.pathname}${target.search}`, rebaseOn)
    : isAllowedTarget?.(target)
      ? target
      : null;

  if (!destination) {
    return NextResponse.redirect(`${fallbackUrl}?error=oauth_failed`);
  }

  // Claimed cookies go on this response, like the state nonce below — the one place they are certain to land.
  const claimed = transformDestination?.(destination);
  const response = NextResponse.redirect((claimed?.url ?? destination).toString());

  for (const { name, value, options } of claimed?.cookies ?? []) {
    response.cookies.set(name, value, options);
  }

  for (const raw of apiResponse.headers.getSetCookie()) {
    const [pair, ...attrs] = raw.split(';');
    const eq = pair.indexOf('=');
    if (eq === -1 || pair.slice(0, eq).trim() !== OAUTH_STATE_COOKIE) {
      continue;
    }

    const value = pair.slice(eq + 1).trim();
    const clearing = attrs.some((attr) => /^\s*max-age=0\s*$/i.test(attr)) || value === '';

    if (clearing) {
      response.cookies.delete(OAUTH_STATE_COOKIE);
    } else {
      response.cookies.set(OAUTH_STATE_COOKIE, value, {
        httpOnly: true,
        secure: appServerConfig.nodeEnv.isProduction,
        sameSite: 'lax',
        path: '/',
        maxAge: OAUTH_STATE_MAX_AGE_S,
      });
    }
  }

  applyAuthCookies(response.cookies, rotated);

  return response;
};
