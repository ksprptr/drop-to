import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';

import { RequestUser as RequestUserType } from '@/common/types/auth-user.types';

/**
 * Extracts the authenticated user from the request (401 if absent).
 **/
export const RequestUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): RequestUserType => {
    const request = ctx.switchToHttp().getRequest<Request>();

    if (!request.user) {
      throw new UnauthorizedException();
    }

    return request.user;
  },
);
