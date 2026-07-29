import type { Request } from 'express';
import type Redis from 'ioredis';

import { RateLimitHelpers } from './rate-limit.helpers';

// RateLimiterRedis calls defineCommand on its store client during construction.
const buildRedis = (): Redis => ({ defineCommand: jest.fn() }) as unknown as Redis;

const buildHelpers = (): RateLimitHelpers => new RateLimitHelpers(buildRedis());

describe('RateLimitHelpers', () => {
  let helpers: RateLimitHelpers;

  beforeEach(() => {
    helpers = buildHelpers();
  });

  describe('normalizeIp', () => {
    it('strips the IPv4-mapped IPv6 prefix', () => {
      expect(helpers.normalizeIp('::ffff:203.0.113.1')).toBe('203.0.113.1');
    });

    it('leaves a plain address untouched', () => {
      expect(helpers.normalizeIp('203.0.113.1')).toBe('203.0.113.1');
      expect(helpers.normalizeIp('::1')).toBe('::1');
    });
  });

  describe('resolveSubjectKey', () => {
    it('builds an ip: key from the (normalized) request ip', () => {
      expect(helpers.resolveSubjectKey({ ip: '::ffff:203.0.113.1' } as Request)).toBe(
        'ip:203.0.113.1',
      );
    });

    it('returns null when the ip is unknown', () => {
      expect(helpers.resolveSubjectKey({ ip: undefined } as unknown as Request)).toBeNull();
    });
  });

  describe('getLimiter', () => {
    const rule = { points: 10, duration: 60 };

    it('caches one limiter per (method, path, rule)', () => {
      const a = helpers.getLimiter({ method: 'POST', path: '/x', rule });
      const b = helpers.getLimiter({ method: 'POST', path: '/x', rule });

      expect(a).toBe(b);
    });

    it('creates distinct limiters for different routes or rules', () => {
      const a = helpers.getLimiter({ method: 'POST', path: '/x', rule });
      const b = helpers.getLimiter({ method: 'GET', path: '/x', rule });
      const c = helpers.getLimiter({
        method: 'POST',
        path: '/x',
        rule: { points: 5, duration: 60 },
      });

      expect(a).not.toBe(b);
      expect(a).not.toBe(c);
    });
  });
});
