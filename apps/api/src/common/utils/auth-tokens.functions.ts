import { parseCookie } from 'cookie';
import type { Request } from 'express';

type AuthTokenType = 'accessToken' | 'refreshToken';

interface ExtractTokenFromCookiesParams {
  type: AuthTokenType;
  request: Request;
}

/**
 * Extracts an auth token from the request cookies (undefined when absent).
 **/
export const extractTokenFromCookies = ({
  type,
  request,
}: ExtractTokenFromCookiesParams): string | undefined => {
  const rawCookie = request.headers.cookie;

  if (!rawCookie) {
    return;
  }

  return parseCookie(rawCookie)[type];
};
