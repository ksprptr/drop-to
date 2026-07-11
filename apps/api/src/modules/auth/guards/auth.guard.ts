import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JsonWebTokenError, JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

import { IS_PUBLIC_KEY } from '@/common/decorators/public.decorator';
import { JwtRequestUser, RequestUser } from '@/common/types/auth-user.types';
import { extractTokenFromCookies } from '@/common/utils/auth-tokens.functions';
import { type JwtConfig, jwtConfig } from '@/config/jwt.config';

/**
 * Class representing an auth guard.
 *
 * Verifies the short-lived access token from the request cookie on every route
 * except those marked `@Public()`. When the access token is missing or expired
 * the guard rejects with 401 — the client is expected to call `POST /auth/refresh`.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    @Inject(jwtConfig.KEY) private readonly jwtCfg: JwtConfig,
  ) {}

  /**
   * Determines whether the request may proceed.
   * @param context - The execution context
   * @returns True when the route is public or the access token is valid
   * @throws UnauthorizedException when the access token is missing, invalid or expired
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const accessToken = extractTokenFromCookies({ type: 'accessToken', request });
    const payload = accessToken ? await this.tryVerify(accessToken) : null;

    if (!payload) {
      throw new UnauthorizedException();
    }

    request.user = payload;
    return true;
  }

  /**
   * Verifies an access token.
   * @param token - The JWT access token
   * @returns The token payload, or null when the token is expired
   * @throws UnauthorizedException when the token is malformed
   */
  private async tryVerify(token: string): Promise<RequestUser | null> {
    try {
      const payload: JwtRequestUser = await this.jwtService.verifyAsync(token, {
        secret: this.jwtCfg.accessSecret,
      });
      const { iat: _iat, exp: _exp, ...user } = payload;

      return user;
    } catch (error) {
      if (!(error instanceof JsonWebTokenError)) {
        throw error;
      }

      if (error.name === 'TokenExpiredError') {
        return null;
      }

      throw new UnauthorizedException('Invalid token');
    }
  }
}
