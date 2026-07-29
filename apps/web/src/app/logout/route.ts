import { NextRequest, NextResponse } from 'next/server';

import { clearAuthCookies } from '@/common/services/auth/tokens.server';
import { getHttp } from '@/common/services/axios/axios.instance';
import { isCrossSiteRequest } from '@/common/utils/request-origin';

/**
 * Best-effort revokes the session at the API, clears the auth cookies and redirects to login.
 **/
export async function GET(request: NextRequest): Promise<NextResponse> {
  // CSRF-logout defense: a cross-site forced navigation must not revoke/clear the operator's session.
  if (isCrossSiteRequest(request)) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  try {
    const http = await getHttp();
    await http.post('/auth/logout');
  } catch {
    // Clear cookies locally regardless.
  }

  const response = NextResponse.redirect(new URL('/login', request.url));
  clearAuthCookies(response.cookies);

  return response;
}
