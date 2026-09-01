import { NextRequest, NextResponse } from 'next/server';

import {
  applyAuthCookies,
  clearAuthCookies,
  parseAuthSetCookies,
} from '@/common/services/auth/tokens.server';
import { getHttp } from '@/common/services/axios/axios.instance';
import { isCrossSiteRequest, resolveRequestOrigin } from '@/common/utils/request-origin';

/**
 * Best-effort revokes the session at the API, clears the auth cookies and redirects to login.
 **/
export async function GET(request: NextRequest): Promise<NextResponse> {
  const origin = resolveRequestOrigin(request);

  // CSRF-logout defense: a cross-site forced navigation must not revoke/clear the operator's session.
  if (isCrossSiteRequest(request)) {
    return NextResponse.redirect(new URL('/login', origin));
  }

  let cleared: ReturnType<typeof parseAuthSetCookies> = [];

  try {
    const http = await getHttp();
    const { headers } = await http.post('/auth/logout');

    // The API's own clearing cookies carry the Domain it set them with — forwarding them is what makes the delete land.
    cleared = parseAuthSetCookies(
      Array.isArray(headers['set-cookie']) ? headers['set-cookie'] : undefined,
    );
  } catch {
    // Unreachable API — fall through and clear locally below.
  }

  const response = NextResponse.redirect(new URL('/login', origin));

  if (cleared.length > 0) {
    applyAuthCookies(response.cookies, cleared);
  } else {
    clearAuthCookies(response.cookies);
  }

  return response;
}
