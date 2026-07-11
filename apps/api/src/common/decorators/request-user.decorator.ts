import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';

import { RequestUser as RequestUserType } from '@/common/types/auth-user.types';

/**
 * Decorator to extract the authenticated user from the request.
 * @throws UnauthorizedException if the user is not present in the request
 */
export const RequestUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): RequestUserType => {
    const request = ctx.switchToHttp().getRequest<Request>();

    if (!request.user) {
      throw new UnauthorizedException();
    }

    return request.user;
  },
);
