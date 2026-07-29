import type { Request } from 'express';

import { extractTokenFromCookies } from './auth-tokens.functions';

const requestWith = (cookie?: string): Request =>
  ({ headers: cookie === undefined ? {} : { cookie } }) as Request;

describe('extractTokenFromCookies', () => {
  it('returns the requested token from the cookie header', () => {
    const request = requestWith('accessToken=abc; refreshToken=def');

    expect(extractTokenFromCookies({ type: 'accessToken', request })).toBe('abc');
    expect(extractTokenFromCookies({ type: 'refreshToken', request })).toBe('def');
  });

  it('returns undefined when there is no cookie header', () => {
    expect(
      extractTokenFromCookies({ type: 'accessToken', request: requestWith() }),
    ).toBeUndefined();
  });

  it('returns undefined when the requested token is absent', () => {
    const request = requestWith('other=1');

    expect(extractTokenFromCookies({ type: 'accessToken', request })).toBeUndefined();
  });
});
