import { Inject, Injectable } from '@nestjs/common';
import { stringifySetCookie } from 'cookie';
import type { Response } from 'express';

import { type AppConfig, appConfig } from '@/config/app.config';
import { type AuthConfig, authConfig } from '@/config/auth.config';

import { ACCESS_TOKEN_TTL_SECONDS, REFRESH_TOKEN_TTL_SECONDS } from './auth-tokens.constants';

type AuthTokenType = 'accessToken' | 'refreshToken';

interface AddTokenToResponseParams {
  response: Response;
  type: AuthTokenType;
  value: string;
}

/**
 * Class representing an auth tokens helper.
 *
 * Serializes access/refresh tokens into httpOnly cookies. An empty value clears
 * the cookie (used on logout).
 */
@Injectable()
export class AuthTokensHelper {
  private readonly cookieDomain?: string;
  private readonly isProduction: boolean;

  constructor(
    @Inject(appConfig.KEY) appCfg: AppConfig,
    @Inject(authConfig.KEY) authCfg: AuthConfig,
  ) {
    this.isProduction = appCfg.isProduction;
    this.cookieDomain = authCfg.cookieDomain;
  }

  /**
   * Helper function to write an auth token into the response cookies.
   * @param response - The HTTP response
   * @param type - The token type (accessToken or refreshToken)
   * @param value - The token value (empty string clears the cookie)
   */
  addToResponse({ response, type, value }: AddTokenToResponseParams): void {
    const maxAge =
      type === 'accessToken' ? ACCESS_TOKEN_TTL_SECONDS : REFRESH_TOKEN_TTL_SECONDS;

    const serialized = stringifySetCookie({
      name: type,
      value,
      ...(this.cookieDomain ? { domain: this.cookieDomain } : {}),
      httpOnly: true,
      secure: this.isProduction,
      sameSite: 'lax',
      maxAge: value === '' ? 0 : maxAge,
      path: '/',
    });

    const existing = response.getHeader('Set-Cookie');

    if (!existing) {
      response.setHeader('Set-Cookie', serialized);
      return;
    }

    const cookies = Array.isArray(existing)
      ? [...existing, serialized]
      : [existing as string, serialized];

    response.setHeader('Set-Cookie', cookies);
  }
}
