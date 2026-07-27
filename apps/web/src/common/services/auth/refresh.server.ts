import 'server-only';

import { REFRESH_MEMO_TTL_MS } from '@/common/constants/auth.constants';
import { parseAuthSetCookies, type ParsedSetCookie } from '@/common/services/auth/tokens.server';
import { getHttp } from '@/common/services/axios/axios.instance';

export interface RefreshContext {
  refreshToken: string;
}

// Single-flight + memo, both keyed by the OLD refresh token, so one API refresh per token.
const inflight = new Map<string, Promise<ParsedSetCookie[]>>();
const memo = new Map<string, { tokens: ParsedSetCookie[]; expiresAt: number }>();

/**
 * Calls the API refresh endpoint once and returns the rotated auth cookies.
 **/
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
 * Refreshes the session (single-flight + memoised) and returns the rotated cookies.
 **/
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
 * Completed tokens if memoised, `'inflight'` if still running, else null.
 **/
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
