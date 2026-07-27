import 'server-only';
import type { ResponseCookies } from 'next/dist/server/web/spec-extension/cookies';

import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from '@/common/constants/auth.constants';
import { appServerConfig } from '@/configs/app/app.server-config';

/** A cookie writer — both `cookies()` and `NextResponse.cookies` satisfy this shape. */
export interface CookieWriter {
  set: ResponseCookies['set'];
  delete: (name: string) => void;
}

export interface ParsedSetCookie {
  name: string;
  value: string;
  maxAge?: number;
}

/** The auth cookies carried from an API response onto the browser (the session pair). */
const AUTH_COOKIE_NAMES = new Set([ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE]);

/**
 * Parses raw `Set-Cookie` header values into name/value/maxAge, keeping only the
 * auth-related cookies.
 * @param setCookies - The `set-cookie` header array from the API response
 * @returns Parsed auth cookies
 */
export const parseAuthSetCookies = (setCookies: string[] | undefined): ParsedSetCookie[] => {
  if (!setCookies) {
    return [];
  }

  const parsed: ParsedSetCookie[] = [];

  for (const raw of setCookies) {
    const [namePart, ...attrs] = raw.split(';');
    const eq = namePart.indexOf('=');
    if (eq === -1) {
      continue;
    }

    const name = namePart.slice(0, eq).trim();
    if (!AUTH_COOKIE_NAMES.has(name)) {
      continue;
    }

    const value = namePart.slice(eq + 1).trim();
    const maxAgeAttr = attrs
      .map((attr) => attr.trim())
      .find((attr) => attr.toLowerCase().startsWith('max-age='));
    const maxAge = maxAgeAttr ? Number(maxAgeAttr.split('=')[1]) : undefined;

    parsed.push({ name, value, maxAge: Number.isFinite(maxAge) ? maxAge : undefined });
  }

  return parsed;
};

/**
 * Writes the given cookies onto a cookie store using attributes consistent with
 * the API (httpOnly, secure in production, cookie domain in production only).
 * @param writer - The target cookie store
 * @param cookiesToSet - The parsed cookies to persist
 */
export const applyAuthCookies = (writer: CookieWriter, cookiesToSet: ParsedSetCookie[]): void => {
  const { isProduction } = appServerConfig.nodeEnv;

  for (const { name, value, maxAge } of cookiesToSet) {
    writer.set(name, value, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      domain: isProduction ? appServerConfig.cookieDomain : undefined,
      maxAge,
    });
  }
};

/**
 * Clears every auth cookie (used on logout and on a failed refresh).
 * @param writer - The target cookie store
 */
export const clearAuthCookies = (writer: CookieWriter): void => {
  for (const name of AUTH_COOKIE_NAMES) {
    writer.delete(name);
  }
};
