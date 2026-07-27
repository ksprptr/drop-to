import 'server-only';

import { REFRESH_MEMO_TTL_MS } from '@/common/constants/auth.constants';
import { parseAuthSetCookies, type ParsedSetCookie } from '@/common/services/auth/tokens.server';
import { getHttp } from '@/common/services/axios/axios.instance';

export interface RefreshContext {
  refreshToken: string;
}

/**
 * Per-instance single-flight of in-progress refreshes, keyed by the OLD refresh
 * token, so concurrent requests carrying the same refresh cookie await one promise.
 */
const inflight = new Map<string, Promise<ParsedSetCookie[]>>();

/** Short-lived memo of completed refreshes, keyed by the OLD refresh token. */
const memo = new Map<string, { tokens: ParsedSetCookie[]; expiresAt: number }>();

/**
 * Calls the API refresh endpoint once and returns the rotated auth cookies parsed
 * from `Set-Cookie`.
 * @returns The rotated auth cookies
 * @throws When the refresh token is expired/revoked (non-2xx) or the network fails
 */
const doRefresh = async (): Promise<ParsedSetCookie[]> => {
  const http = await getHttp();
  const response = await http.post('/auth/refresh');

  const setCookieHeader = response.headers['set-cookie'];
  const tokens = parseAuthSetCookies(Array.isArray(setCookieHeader) ? setCookieHeader : undefined);

  if (tokens.length === 0) {
    throw new Error('Refresh response contained no auth cookies');
  }

  return tokens;
};

/**
 * Refreshes the session with single-flight + short-TTL memoisation, both keyed by
 * the old refresh token, so at most one API refresh happens per token.
 * @param ctx - The refresh context (old refresh token)
 * @returns The rotated auth cookies to apply to the response
 */
export const refreshSession = async (ctx: RefreshContext): Promise<ParsedSetCookie[]> => {
  const key = ctx.refreshToken;

  const cached = memo.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.tokens;
  }

  const existing = inflight.get(key);
  if (existing) {
    return existing;
  }

  const promise = doRefresh()
    .then((tokens) => {
      memo.set(key, { tokens, expiresAt: Date.now() + REFRESH_MEMO_TTL_MS });
      return tokens;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, promise);

  return promise;
};

/**
 * Reports whether a refresh for the given token is in flight or freshly memoised.
 * @param refreshToken - The old refresh token
 * @returns The completed tokens if available, `'inflight'` if still running, or null
 */
export const peekRefresh = (refreshToken: string): ParsedSetCookie[] | 'inflight' | null => {
  const cached = memo.get(refreshToken);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.tokens;
  }

  if (inflight.has(refreshToken)) {
    return 'inflight';
  }

  return null;
};
