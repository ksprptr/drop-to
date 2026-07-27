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

  it('signs the access token with the access secret and TTL', async () => {
    await expect(helpers.signAccessToken({ sub: 'admin' })).resolves.toBe('signed');
    expect(signAsync).toHaveBeenCalledWith(
      { sub: 'admin' },
      { secret: 'access-secret', expiresIn: ACCESS_TOKEN_TTL_SECONDS },
    );
  });

  it('signs the refresh token with the refresh secret and TTL', async () => {
    await helpers.signRefreshToken({ sub: 'admin' });
    expect(signAsync).toHaveBeenCalledWith(
      { sub: 'admin' },
      { secret: 'refresh-secret', expiresIn: REFRESH_TOKEN_TTL_SECONDS },
    );
  });
});
