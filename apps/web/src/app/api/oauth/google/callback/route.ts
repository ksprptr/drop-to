import { cookies } from 'next/headers';

import {
  DRIVE_OWNER_COOKIE,
  DRIVE_OWNER_MAX_AGE_S,
  OAUTH_STATE_COOKIE,
} from '@/common/constants/auth.constants';
import { proxyOAuthLeg } from '@/common/services/api/passthrough.server';
import { resolveRequestOrigin } from '@/common/utils/request-origin';
import { appServerConfig } from '@/configs/app/app.server-config';

/**
 * Receives Google's redirect and hands it to the API, which verifies the `state` nonce.
 **/
// No cross-site guard on purpose — the caller is Google; the API's `state` check is the CSRF defense.
export async function GET(request: Request): Promise<Response> {
  const origin = resolveRequestOrigin(request);
  const query = new URL(request.url).search;
  const state = (await cookies()).get(OAUTH_STATE_COOKIE)?.value;

  return proxyOAuthLeg(`/google-auth/google/callback${query}`, {
    cookieHeader: state ? `${OAUTH_STATE_COOKIE}=${state}` : null,
    rebaseOn: origin,
    // The API can only pass the owner proof in the query, so it is claimed here and never reaches the address bar.
    transformDestination: (destination) => {
      const ownerToken = destination.searchParams.get('ownerToken');

      destination.searchParams.delete('ownerToken');
      destination.searchParams.delete('email');

      return {
        url: destination,
        cookies: ownerToken
          ? [
              {
                name: DRIVE_OWNER_COOKIE,
                value: ownerToken,
                options: {
                  httpOnly: true,
                  secure: appServerConfig.nodeEnv.isProduction,
                  sameSite: 'lax' as const,
                  path: '/',
                  maxAge: DRIVE_OWNER_MAX_AGE_S,
                },
              },
            ]
          : [],
      };
    },
    fallbackUrl: origin,
    unauthorizedUrl: `${origin}/login`,
  });
}
