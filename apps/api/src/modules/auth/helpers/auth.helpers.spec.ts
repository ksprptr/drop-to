import type { JwtService } from '@nestjs/jwt';

import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
} from '@/common/services/auth-tokens/auth-tokens.constants';
import type { JwtConfig } from '@/config/jwt.config';

import { AuthHelpers } from './auth.helpers';

describe('AuthHelpers', () => {
  const signAsync = jest.fn().mockResolvedValue('signed');
  const jwt = { signAsync } as unknown as JwtService;
  const cfg = { accessSecret: 'access-secret', refreshSecret: 'refresh-secret' } as JwtConfig;
  const helpers = new AuthHelpers(jwt, cfg);

  beforeEach(() => signAsync.mockClear());

  it('signs the access token with the access secret, HS256 and TTL', async () => {
    await expect(helpers.signAccessToken({ sub: 'admin', ver: 0 })).resolves.toBe('signed');
    expect(signAsync).toHaveBeenCalledWith(
      { sub: 'admin', ver: 0 },
      { secret: 'access-secret', algorithm: 'HS256', expiresIn: ACCESS_TOKEN_TTL_SECONDS },
    );
  });

  it('signs the refresh token with the refresh secret, HS256 and TTL', async () => {
    await helpers.signRefreshToken({ sub: 'admin', ver: 2 });
    expect(signAsync).toHaveBeenCalledWith(
      { sub: 'admin', ver: 2 },
      { secret: 'refresh-secret', algorithm: 'HS256', expiresIn: REFRESH_TOKEN_TTL_SECONDS },
    );
  });
});
