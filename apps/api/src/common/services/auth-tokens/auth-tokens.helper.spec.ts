import type { Response } from 'express';

import type { AppConfig } from '@/config/app.config';
import type { AuthConfig } from '@/config/auth.config';

import { ACCESS_COOKIE_MAX_AGE_SECONDS, REFRESH_TOKEN_TTL_SECONDS } from './auth-tokens.constants';
import { AuthTokensHelper } from './auth-tokens.helper';

const makeResponse = () => {
  const headers = new Map<string, string | string[]>();
  const response = {
    getHeader: (name: string) => headers.get(name),
    setHeader: (name: string, value: string | string[]) => headers.set(name, value),
  } as unknown as Response;
  return { response, headers };
};

const helper = (isDevelopment: boolean, cookieDomain?: string) =>
  new AuthTokensHelper({ isDevelopment } as AppConfig, { cookieDomain } as AuthConfig);

describe('AuthTokensHelper', () => {
  it('writes an httpOnly, lax, secure (non-dev) cookie with the access cookie max-age and domain', () => {
    const { response, headers } = makeResponse();

    helper(false, '.example.com').addToResponse({ response, type: 'accessToken', value: 'tok' });

    const cookie = (headers.get('Set-Cookie') as string).toLowerCase();
    expect(cookie).toContain('accesstoken=tok');
    // The cookie is a long-lived container; the JWT inside is short-lived (15 min) and refreshed.
    expect(cookie).toContain(`max-age=${ACCESS_COOKIE_MAX_AGE_SECONDS}`);
    expect(cookie).toContain('httponly');
    expect(cookie).toContain('samesite=lax');
    expect(cookie).toContain('secure');
    expect(cookie).toContain('domain=.example.com');
    expect(cookie).toContain('path=/');
  });

  it('clears the cookie (Max-Age=0) when the value is empty', () => {
    const { response, headers } = makeResponse();

    helper(false, '.example.com').addToResponse({ response, type: 'refreshToken', value: '' });

    expect((headers.get('Set-Cookie') as string).toLowerCase()).toContain('max-age=0');
  });

  it('omits Secure/Domain in development and uses the refresh TTL', () => {
    const { response, headers } = makeResponse();

    helper(true).addToResponse({ response, type: 'refreshToken', value: 'r' });

    const cookie = (headers.get('Set-Cookie') as string).toLowerCase();
    expect(cookie).toContain(`max-age=${REFRESH_TOKEN_TTL_SECONDS}`);
    expect(cookie).not.toContain('secure');
    expect(cookie).not.toContain('domain=');
  });

  it('appends to an existing Set-Cookie header (both tokens survive)', () => {
    const { response, headers } = makeResponse();
    const h = helper(true);

    h.addToResponse({ response, type: 'accessToken', value: 'a' });
    h.addToResponse({ response, type: 'refreshToken', value: 'b' });

    const cookies = headers.get('Set-Cookie') as string[];
    expect(Array.isArray(cookies)).toBe(true);
    expect(cookies).toHaveLength(2);
  });
});
