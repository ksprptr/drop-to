import type { JwtService } from '@nestjs/jwt';
import { createHash } from 'node:crypto';

import { ACCESS_TOKEN_TTL_SECONDS } from '@/common/services/auth-tokens/auth-tokens.constants';
import type { JwtConfig } from '@/config/jwt.config';

import { AuthHelpers } from './auth.helpers';

describe('AuthHelpers', () => {
  const signAsync = jest.fn().mockResolvedValue('signed');
  const jwt = { signAsync } as unknown as JwtService;
  const cfg = { accessSecret: 'access-secret' } as JwtConfig;
  const helpers = new AuthHelpers(jwt, cfg);

  beforeEach(() => signAsync.mockClear());

  it('signs the access token with the access secret, HS256 and TTL', async () => {
    await expect(helpers.signAccessToken({ sub: 'admin', ver: 0 })).resolves.toBe('signed');
    expect(signAsync).toHaveBeenCalledWith(
      { sub: 'admin', ver: 0 },
      { secret: 'access-secret', algorithm: 'HS256', expiresIn: ACCESS_TOKEN_TTL_SECONDS },
    );
  });

  it('mints a high-entropy, unique refresh secret each call', () => {
    const a = helpers.generateRefreshSecret();
    const b = helpers.generateRefreshSecret();

    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/); // base64url
    expect(a.length).toBeGreaterThanOrEqual(43); // 48 bytes → 64 base64url chars
  });

  it('hashes a token with SHA-256 (deterministic, never the raw value)', () => {
    const hash = helpers.hashToken('secret-token');

    expect(hash).toBe(createHash('sha256').update('secret-token').digest('hex'));
    expect(hash).not.toContain('secret-token');
    expect(helpers.hashToken('secret-token')).toBe(hash);
  });
});
