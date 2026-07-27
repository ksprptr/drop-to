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
} from '@/common/constants/auth.constants';
import { peekRefresh, refreshSession } from '@/common/services/auth/refresh.server';
import { applyAuthCookies, clearAuthCookies, type ParsedSetCookie } from '@/common/services/auth/tokens.server';
import { isAccessTokenFresh } from '@/common/utils/jwt.functions';

/** Routes reachable without a valid session. */
const PUBLIC_PATHS = ['/login'];

const isPublicPath = (pathname: string): boolean =>
  PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));

/**
 * Rebuilds the incoming request's `Cookie` header with the rotated session applied,
 * so THIS request's Server Components read the fresh access token via `cookies()`
 * instead of the stale one the browser sent.
 */
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

/** Builds a redirect to the login page, optionally flagging an expired session. */
const redirectToLogin = (request: NextRequest, sessionExpired: boolean): NextResponse => {
  const url = new URL('/login', request.url);
  if (sessionExpired) {
    url.searchParams.set('reason', 'session-expired');
  }

  const response = NextResponse.redirect(url);
  clearAuthCookies(response.cookies);

  return response;
};

/**
 * Waits for an in-flight refresh (started by a concurrent request) to complete,
 * polling the local memo.
 * @param refreshToken - The old refresh token being rotated
 * @returns The rotated cookies once available, or null on timeout
 */
const waitForRefresh = async (refreshToken: string): Promise<ParsedSetCookie[] | null> => {
  for (let attempt = 0; attempt < REFRESH_WAIT_MAX_ATTEMPTS; attempt += 1) {
    const state = peekRefresh(refreshToken);
    if (Array.isArray(state)) {
      return state;
    }

     
    await new Promise((resolve) => setTimeout(resolve, REFRESH_WAIT_INTERVAL_MS));
  }

  return null;
};

/**
 * Auth proxy: guards workspace routes and keeps the access token fresh before
 * render. Decodes the access token's `exp` (no signature check — the API verifies)
 * and refreshes proactively when it is missing or within {@link ACCESS_EXP_SKEW_MS}
 * of expiry, collapsing concurrent refreshes with a single-flight + lock cookie.
 * A failed refresh clears cookies and redirects to login.
 * @param request - The incoming request
 * @returns The response (next, or a redirect)
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  const cookieStore = await cookies();

  // Logout route clears cookies itself — let it through regardless of token state.
  if (pathname === '/logout') {
    return NextResponse.next();
  }

  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
  const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE)?.value;
  const accessFresh = isAccessTokenFresh(accessToken, ACCESS_EXP_SKEW_MS);

  // Public routes: bounce authenticated users to the workspace, else let them through.
  if (isPublicPath(pathname)) {
    if (accessFresh) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  // No refresh token at all → not logged in.
  if (!refreshToken) {
    return redirectToLogin(request, false);
  }

  // Access token still valid → no work.
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
    return redirectToLogin(request, true);
  }
}

/** Skip Next internals, route handlers and static assets; the proxy runs on navigations only. */
export const config: ProxyConfig = {
  matcher: '/((?!_next|api|.*\\..*).*)',
};
