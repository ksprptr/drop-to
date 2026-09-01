import 'server-only';
import type { ResponseCookies } from 'next/dist/server/web/spec-extension/cookies';

import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from '@/common/constants/auth.constants';

/** Both `cookies()` and `NextResponse.cookies` satisfy this shape. */
export interface CookieWriter {
  set: ResponseCookies['set'];
  delete: (name: string) => void;
}

/** An auth cookie exactly as the API issued it — every attribute travels with it. */
export interface ParsedSetCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  maxAge?: number;
  expires?: Date;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'lax' | 'strict' | 'none';
}

const AUTH_COOKIE_NAMES = new Set([ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE]);

/**
 * Reads one `Set-Cookie` attribute list into the options a cookie writer takes.
 **/
const parseAttributes = (attrs: string[]): Omit<ParsedSetCookie, 'name' | 'value'> => {
  const parsed: Omit<ParsedSetCookie, 'name' | 'value'> = {};

  for (const attr of attrs) {
    const [rawKey, ...rest] = attr.split('=');
    const key = rawKey.trim().toLowerCase();
    const value = rest.join('=').trim();

    switch (key) {
      case 'domain':
        parsed.domain = value || undefined;
        break;
      case 'path':
        parsed.path = value;
        break;
      case 'max-age': {
        const maxAge = Number(value);
        if (Number.isFinite(maxAge)) {
          parsed.maxAge = maxAge;
        }
        break;
      }
      case 'expires': {
        const expires = new Date(value);
        if (!Number.isNaN(expires.getTime())) {
          parsed.expires = expires;
        }
        break;
      }
      case 'httponly':
        parsed.httpOnly = true;
        break;
      case 'secure':
        parsed.secure = true;
        break;
      case 'samesite': {
        const sameSite = value.toLowerCase();
        if (sameSite === 'lax' || sameSite === 'strict' || sameSite === 'none') {
          parsed.sameSite = sameSite;
        }
        break;
      }
    }
  }

  return parsed;
};

/**
 * Parses `Set-Cookie` headers, keeping the auth cookies with every attribute intact.
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

    parsed.push({
      name,
      value: namePart.slice(eq + 1).trim(),
      ...parseAttributes(attrs),
    });
  }

  return parsed;
};

/**
 * Writes auth cookies onto this response, exactly as the API issued them.
 **/
export const applyAuthCookies = (writer: CookieWriter, cookiesToSet: ParsedSetCookie[]): void => {
  for (const { name, value, ...attributes } of cookiesToSet) {
    writer.set(name, value, attributes);
  }
};

/**
 * Clears every auth cookie when the API gave us no `Set-Cookie` to forward.
 **/
export const clearAuthCookies = (writer: CookieWriter): void => {
  for (const name of AUTH_COOKIE_NAMES) {
    writer.set(name, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });
  }
};
