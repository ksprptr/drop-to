import { NextResponse } from 'next/server';

import {
  proxyOAuthLeg,
  resolveSessionForPassthrough,
} from '@/common/services/api/passthrough.server';
import { isCrossSiteRequest, resolveRequestOrigin } from '@/common/utils/request-origin';

/** Consent screens Google may send the operator to. */
const GOOGLE_CONSENT_HOSTS = new Set(['accounts.google.com']);

/**
 * Starts the Google consent flow, so the browser never has to reach the API's own host.
 **/
export async function GET(request: Request): Promise<Response> {
  if (isCrossSiteRequest(request)) {
    return NextResponse.json({ message: 'Cross-site request rejected.' }, { status: 403 });
  }

  const origin = resolveRequestOrigin(request);
  const session = await resolveSessionForPassthrough();

  return proxyOAuthLeg('/google-auth/google', {
    cookieHeader: session.cookieHeader,
    rotated: session.rotated,
    isAllowedTarget: (target) =>
      target.protocol === 'https:' && GOOGLE_CONSENT_HOSTS.has(target.hostname),
    fallbackUrl: origin,
    unauthorizedUrl: `${origin}/login`,
  });
}
