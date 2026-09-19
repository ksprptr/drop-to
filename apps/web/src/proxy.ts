import { cookies } from 'next/headers';
import { NextRequest, NextResponse, type ProxyConfig } from 'next/server';

import {
  ACCESS_EXP_SKEW_MS,
  ACCESS_TOKEN_COOKIE,
  REFRESH_LOCK_COOKIE,
  REFRESH_LOCK_MAX_AGE_S,
  REFRESH_TOKEN_COOKIE,
  REFRESH_WAIT_INTERVAL_MS,
  REFRESH_WAIT_MAX_ATTEMPTS,
  SESSION_EXPIRED_REASON,
} from '@/common/constants/auth.constants';
import { peekRefresh, refreshSession } from '@/common/services/auth/refresh.server';
import {
  applyAuthCookies,
  clearAuthCookies,
  type CookieWriter,
  type ParsedSetCookie,
} from '@/common/services/auth/tokens.server';
import { isAccessTokenFresh } from '@/common/utils/jwt.functions';
import { isCrossSiteRequest, resolveRequestOrigin } from '@/common/utils/request-origin';
import { appServerConfig } from '@/configs/app/app.server-config';

/** Routes reachable without a valid session. */
const PUBLIC_PATHS = ['/login'];

const isPublicPath = (pathname: string): boolean =>
  PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));

/**
 * Applies the rotated session to this request's Cookie header so RSC reads the fresh token.
 **/
const withRefreshedCookies = (request: NextRequest, tokens: ParsedSetCookie[]): Headers => {
  const jar = new Map(request.cookies.getAll().map(({ name, value }) => [name, value]));
  jar.delete(REFRESH_LOCK_COOKIE);

  for (const { name, value } of tokens) {
    jar.set(name, value);
  }

  const headers = new Headers(request.headers);
  headers.set('cookie', Array.from(jar, ([name, value]) => `${name}=${value}`).join('; '));

  return headers;
};

/**
 * Builds a redirect to the login page, optionally flagging an expired session.
 **/
// Clears through the cookie store rather than the response: once anything in this pass has written
// via `cookies()` — the refresh lock below does — Next emits only those writes and drops the ones
// made on the returned response, which would silently leave the dead cookies in place.
const redirectToLogin = (
  request: NextRequest,
  cookieStore: CookieWriter,
  sessionExpired: boolean,
): NextResponse => {
  const url = new URL('/login', resolveRequestOrigin(request));
  if (sessionExpired) {
    url.searchParams.set('reason', SESSION_EXPIRED_REASON);
  }

  clearAuthCookies(cookieStore);

  return NextResponse.redirect(url);
};

/**
 * Waits for a concurrent in-flight refresh to land (polls the memo), or null on timeout.
 **/
const waitForRefresh = async (refreshToken: string): Promise<ParsedSetCookie[] | null> => {
  for (let attempt = 0; attempt < REFRESH_WAIT_MAX_ATTEMPTS; attempt += 1) {
    const state = peekRefresh(refreshToken);
    if (Array.isArray(state)) {
      return state;
    }

    // eslint-disable-next-line no-await-in-loop -- deliberate delay between poll attempts
    await new Promise((resolve) => setTimeout(resolve, REFRESH_WAIT_INTERVAL_MS));
  }

  return null;
};

/**
 * Auth gate: guards routes and proactively refreshes the access token (single-flight) before render.
 **/
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  const cookieStore = await cookies();

  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
  const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE)?.value;
  const accessFresh = isAccessTokenFresh(accessToken, ACCESS_EXP_SKEW_MS);

  // Public routes: bounce authenticated users to the workspace, else let them through.
  if (isPublicPath(pathname)) {
    // The workspace bounces here when the API rejects a token that still looks fresh; sending it
    // back on `accessFresh` would loop, so the flag ends the session here instead. A render cannot
    // write cookies, which is why the dead pair is cleared on this leg rather than by the page.
    if (request.nextUrl.searchParams.get('reason') === SESSION_EXPIRED_REASON) {
      // Same-site only: a forced cross-site navigation must not be able to sign the operator out.
      if (!isCrossSiteRequest(request)) {
        clearAuthCookies(cookieStore);
      }

      return NextResponse.next();
    }

    if (accessFresh) {
      return NextResponse.redirect(new URL('/', resolveRequestOrigin(request)));
    }
    return NextResponse.next();
  }

  if (!refreshToken) {
    return redirectToLogin(request, cookieStore, false);
  }

  if (accessFresh) {
    return NextResponse.next();
  }

  // A lock cookie means a refresh is already underway on this instance; wait for it.
  const lockActive = Boolean(cookieStore.get(REFRESH_LOCK_COOKIE)?.value);

  if (lockActive && peekRefresh(refreshToken) === null) {
    const waited = await waitForRefresh(refreshToken);
    if (waited) {
      applyAuthCookies(cookieStore, waited);
      return NextResponse.next({ request: { headers: withRefreshedCookies(request, waited) } });
    }
    // Timed out → the lock is likely stale (crashed refresh); refresh ourselves.
  }

  cookieStore.set(REFRESH_LOCK_COOKIE, '1', {
    httpOnly: true,
    secure: appServerConfig.nodeEnv.isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: REFRESH_LOCK_MAX_AGE_S,
  });

  try {
    const tokens = await refreshSession({ refreshToken });

    applyAuthCookies(cookieStore, tokens);
    cookieStore.delete(REFRESH_LOCK_COOKIE);

    return NextResponse.next({ request: { headers: withRefreshedCookies(request, tokens) } });
  } catch {
    return redirectToLogin(request, cookieStore, true);
  }
}

// Skip Next internals, route handlers and static assets; the proxy runs on navigations only.
// The generated icons carry no extension, so they need naming — without that the browser's
// favicon request would be bounced to /login like any other page.
export const config: ProxyConfig = {
  matcher: '/((?!_next|api|icon$|apple-icon$|.*\\..*).*)',
};
