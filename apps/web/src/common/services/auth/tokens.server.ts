import 'server-only';
import type { ResponseCookies } from 'next/dist/server/web/spec-extension/cookies';

import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from '@/common/constants/auth.constants';
import { appServerConfig } from '@/configs/app/app.server-config';

/** Both `cookies()` and `NextResponse.cookies` satisfy this shape. */
export interface CookieWriter {
  set: ResponseCookies['set'];
  delete: (name: string) => void;
}

export interface ParsedSetCookie {
  name: string;
  value: string;
  maxAge?: number;
}

const AUTH_COOKIE_NAMES = new Set([ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE]);

/**
 * Parses `Set-Cookie` headers, keeping only the auth cookies.
 **/
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
 * Writes auth cookies (httpOnly, secure + domain in production).
 **/
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
 * Clears every auth cookie (logout / failed refresh).
 **/
export const clearAuthCookies = (writer: CookieWriter): void => {
  const { isProduction } = appServerConfig.nodeEnv;

  for (const name of AUTH_COOKIE_NAMES) {
    writer.set(name, '', {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      domain: isProduction ? appServerConfig.cookieDomain : undefined,
      maxAge: 0,
    });
  }
};
