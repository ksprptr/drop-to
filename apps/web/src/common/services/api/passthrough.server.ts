import 'server-only';
import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';

import {
  ACCESS_EXP_SKEW_MS,
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
} from '@/common/constants/auth.constants';
import { refreshSession } from '@/common/services/auth/refresh.server';
import { applyAuthCookies, type ParsedSetCookie } from '@/common/services/auth/tokens.server';
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
 * Resolves the session for a streaming route handler. These bypass the proxy's proactive refresh
 * (its matcher skips `/api`), so with short-lived access tokens a long transfer could carry an
 * already-expired token. Refresh up front here so the API authenticates the request at its start;
 * `rotated` must be written back to the browser so the next proxy refresh doesn't replay the old
 * (now-rotated) refresh token.
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
      // Refresh failed — fall through with the stale token; the API returns 401 and the client
      // re-authenticates on its next navigation.
      rotated = [];
    }
  }

  const parts: string[] = [];
  if (accessValue) parts.push(`${ACCESS_TOKEN_COOKIE}=${accessValue}`);
  if (refreshValue) parts.push(`${REFRESH_TOKEN_COOKIE}=${refreshValue}`);

  return { cookieHeader: parts.length > 0 ? parts.join('; ') : null, rotated };
};

/**
 * Passthrough request headers to the API: forwards session cookies and the client IP. When
 * `cookieHeader` is given (from a pre-flight refresh) it is used verbatim; otherwise the current
 * request cookies are forwarded as-is.
 **/
export const apiAuthHeaders = async (base?: HeadersInit, cookieHeader?: string): Promise<Headers> => {
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

  const clientIp = headersList.get('cf-connecting-ip') ?? headersList.get('x-forwarded-for');
  if (clientIp) {
    result.set('x-forwarded-for', clientIp);
  }

  return result;
};

const DOWNLOAD_HEADERS = ['content-type', 'content-disposition', 'content-length', 'accept-ranges'];

/**
 * Streams a GET download from the API back to the browser, forwarding the key headers and any
 * cookies rotated by a pre-flight refresh.
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
