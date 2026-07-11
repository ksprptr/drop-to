import * as cookie from 'cookie';
import type { Request } from 'express';

type AuthTokenType = 'accessToken' | 'refreshToken';

interface ExtractTokenFromCookiesParams {
  type: AuthTokenType;
  request: Request;
}

/**
 * Function to extract an auth token from the request cookies.
 * @param type - The token to extract (accessToken or refreshToken)
 * @param request - The incoming HTTP request
 * @returns The token value, or undefined when absent
 */
export const extractTokenFromCookies = ({
  type,
  request,
}: ExtractTokenFromCookiesParams): string | undefined => {
  const rawCookie = request.headers.cookie;

  if (!rawCookie) {
    return;
  }

  return cookie.parse(rawCookie)[type];
};
