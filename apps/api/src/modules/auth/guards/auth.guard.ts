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

import { AuthStateService } from '../auth-state.service';

/**
 * Verifies the access-token cookie on every non-`@Public()` route; missing/expired/revoked → 401.
 **/
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    @Inject(jwtConfig.KEY) private readonly jwtCfg: JwtConfig,
    private readonly authStateService: AuthStateService,
  ) {}

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

    // Revocation check: reject a signature-valid token whose version is stale (a logout since
    // it was issued bumped the version).
    const currentVersion = await this.authStateService.getTokenVersion();
    if (payload.ver !== currentVersion) {
      throw new UnauthorizedException();
    }

    request.user = { sub: payload.sub };
    return true;
  }

  /**
   * Verifies an access token; null when expired, throws when malformed.
   **/
  private async tryVerify(token: string): Promise<(RequestUser & { ver: number }) | null> {
    try {
      const payload: JwtRequestUser = await this.jwtService.verifyAsync(token, {
        secret: this.jwtCfg.accessSecret,
        algorithms: ['HS256'],
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
