import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import type { Request } from 'express';

import type { RequestUser as RequestUserType } from '@/common/types/auth-user.types';

import { RequestUser } from './request-user.decorator';

/**
 * Extracts the factory out of a param decorator by applying it to a throwaway handler.
 **/
// `createParamDecorator` hands back a decorator, not the function it wraps; Nest stores the factory
// in the route-args metadata, which is the only supported way to get at it for a direct unit test.
const factoryOf = (
  decorator: typeof RequestUser,
): ((data: unknown, ctx: ExecutionContext) => RequestUserType) => {
  class Probe {
    handle(@decorator() user: RequestUserType): RequestUserType {
      return user;
    }
  }

  const args = Reflect.getMetadata(ROUTE_ARGS_METADATA, Probe, 'handle') as Record<
    string,
    { factory: (data: unknown, ctx: ExecutionContext) => RequestUserType }
  >;

  return args[Object.keys(args)[0]].factory;
};

/**
 * Builds an ExecutionContext whose request carries the given user.
 **/
const buildContext = (user?: unknown): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ user }) as Partial<Request> }),
  }) as unknown as ExecutionContext;

describe('RequestUser', () => {
  const factory = factoryOf(RequestUser);

  it('returns the user the guard attached to the request', () => {
    const user = { username: 'operator' };

    expect(factory(undefined, buildContext(user))).toBe(user);
  });

  it('throws 401 when no user is attached', () => {
    // Reached only if a route is mounted without the guard; failing closed keeps a handler from
    // running with an undefined user rather than letting it decide what that means.
    expect(() => factory(undefined, buildContext(undefined))).toThrow(UnauthorizedException);
  });
});
