import { BadRequestException, ExecutionContext, HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import type { RateLimitConfig } from '@/config/rate-limit.config';

import { RateLimit } from '../decorators/rate-limit.decorator';
import { SkipRateLimit } from '../decorators/skip-rate-limit.decorator';
import type { RateLimitHelpers } from '../helpers/rate-limit.helpers';
import { RateLimitGuard } from './rate-limit.guard';

// Real decorators on real classes, read back through a real Reflector: mocking the reflector would
// pass even if the guard looked up the wrong metadata key, which is the mistake worth catching.
class PlainController {
  plain(): void {}

  @SkipRateLimit()
  skipped(): void {}

  @RateLimit({ points: 2, duration: 30, blockDuration: 300, errorMessage: 'Slow down.' })
  limited(): void {}
}

@SkipRateLimit()
class SkippedController {
  plain(): void {}
}

@RateLimit({ points: 7, duration: 70 })
class RuledController {
  plain(): void {}

  @RateLimit({ points: 1, duration: 10 })
  stricter(): void {}
}

/**
 * Builds an ExecutionContext pointing at the given class/handler with the given request shape.
 **/
const buildContext = (
  clazz: unknown,
  handler: unknown,
  request: Partial<Request> = {},
): ExecutionContext =>
  ({
    getHandler: () => handler,
    getClass: () => clazz,
    switchToHttp: () => ({
      getRequest: () => ({ method: 'post', path: '/things', ip: '1.2.3.4', ...request }),
    }),
  }) as unknown as ExecutionContext;

describe('RateLimitGuard', () => {
  let helpers: { resolveSubjectKey: jest.Mock; getLimiter: jest.Mock };
  let consume: jest.Mock;
  let cfg: RateLimitConfig;

  const buildGuard = () =>
    new RateLimitGuard(new Reflector(), helpers as unknown as RateLimitHelpers, cfg);

  beforeEach(() => {
    consume = jest.fn().mockResolvedValue(undefined);
    helpers = {
      resolveSubjectKey: jest.fn().mockReturnValue('ip:1.2.3.4'),
      getLimiter: jest.fn().mockReturnValue({ consume }),
    };
    cfg = { enabled: true, defaultPoints: 300, defaultDuration: 60 };
  });

  describe('opt-outs', () => {
    it('passes everything through when the kill-switch is off', async () => {
      cfg = { ...cfg, enabled: false };

      const context = buildContext(PlainController, PlainController.prototype.plain);

      await expect(buildGuard().canActivate(context)).resolves.toBe(true);
      expect(helpers.getLimiter).not.toHaveBeenCalled();
      expect(consume).not.toHaveBeenCalled();
    });

    it('skips a handler marked @SkipRateLimit', async () => {
      const context = buildContext(PlainController, PlainController.prototype.skipped);

      await expect(buildGuard().canActivate(context)).resolves.toBe(true);
      expect(consume).not.toHaveBeenCalled();
    });

    it('skips every handler of a class marked @SkipRateLimit', async () => {
      const context = buildContext(SkippedController, SkippedController.prototype.plain);

      await expect(buildGuard().canActivate(context)).resolves.toBe(true);
      expect(consume).not.toHaveBeenCalled();
    });
  });

  describe('rule resolution', () => {
    it('falls back to the configured default when nothing is decorated', async () => {
      const context = buildContext(PlainController, PlainController.prototype.plain);

      await buildGuard().canActivate(context);

      expect(helpers.getLimiter).toHaveBeenCalledWith(
        expect.objectContaining({ rule: { points: 300, duration: 60 } }),
      );
    });

    it('uses the class rule when the handler has none', async () => {
      const context = buildContext(RuledController, RuledController.prototype.plain);

      await buildGuard().canActivate(context);

      expect(helpers.getLimiter).toHaveBeenCalledWith(
        expect.objectContaining({ rule: { points: 7, duration: 70 } }),
      );
    });

    it('prefers the handler rule over the class rule', async () => {
      const context = buildContext(RuledController, RuledController.prototype.stricter);

      await buildGuard().canActivate(context);

      expect(helpers.getLimiter).toHaveBeenCalledWith(
        expect.objectContaining({ rule: { points: 1, duration: 10 } }),
      );
    });
  });

  describe('bucket identity', () => {
    it('uppercases the method and prefers the route path over the resolved one', async () => {
      const context = buildContext(PlainController, PlainController.prototype.plain, {
        method: 'patch',
        path: '/things/abc-123',
        route: { path: '/things/:id' },
      } as Partial<Request>);

      await buildGuard().canActivate(context);

      // The route pattern, not the concrete URL — otherwise every id would get its own bucket.
      expect(helpers.getLimiter).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'PATCH', path: '/things/:id' }),
      );
    });

    it('falls back to UNKNOWN when neither method nor path can be determined', async () => {
      const context = buildContext(PlainController, PlainController.prototype.plain, {
        method: undefined,
        path: undefined,
      } as unknown as Partial<Request>);

      await buildGuard().canActivate(context);

      expect(helpers.getLimiter).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'UNKNOWN', path: 'UNKNOWN' }),
      );
    });

    it('consumes a point against the resolved subject key', async () => {
      const context = buildContext(PlainController, PlainController.prototype.plain);

      await expect(buildGuard().canActivate(context)).resolves.toBe(true);
      expect(consume).toHaveBeenCalledWith('ip:1.2.3.4');
    });
  });

  describe('rejections', () => {
    it('rejects with 400 when no subject key can be derived', async () => {
      helpers.resolveSubjectKey.mockReturnValue(null);

      const context = buildContext(PlainController, PlainController.prototype.plain);

      await expect(buildGuard().canActivate(context)).rejects.toBeInstanceOf(BadRequestException);
      expect(consume).not.toHaveBeenCalled();
    });

    it('turns an exhausted bucket into a 429', async () => {
      consume.mockRejectedValue(new Error('consumed'));

      const context = buildContext(PlainController, PlainController.prototype.plain);

      await expect(buildGuard().canActivate(context)).rejects.toMatchObject({
        status: 429,
        message: 'Too many requests, try again later.',
      });
    });

    it("uses the rule's own message when it declares one", async () => {
      consume.mockRejectedValue(new Error('consumed'));

      const context = buildContext(PlainController, PlainController.prototype.limited);

      await expect(buildGuard().canActivate(context)).rejects.toMatchObject({
        status: 429,
        message: 'Slow down.',
      });
    });

    it('never leaks the limiter error itself (it can carry bucket internals)', async () => {
      consume.mockRejectedValue({ msBeforeNext: 42_000, remainingPoints: 0 });

      const context = buildContext(PlainController, PlainController.prototype.plain);

      const error = await buildGuard()
        .canActivate(context)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(HttpException);
      expect(JSON.stringify(error)).not.toContain('msBeforeNext');
    });
  });
});
