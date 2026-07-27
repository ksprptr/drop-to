import { NextRequest, NextResponse } from 'next/server';

import { clearAuthCookies } from '@/common/services/auth/tokens.server';
import { getHttp } from '@/common/services/axios/axios.instance';

/**
 * Logout route: best-effort revokes the session at the API, then clears every auth
 * cookie and redirects to login. A Server Component can't clear cookies, so
 * `getCurrentUser` redirects here when the session is gone; the sidebar logout
 * button navigates here too.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const http = await getHttp();
    await http.post('/auth/logout');
  } catch {
    // Ignore — clear cookies locally regardless so the operator ends up signed out.
  }

  const response = NextResponse.redirect(new URL('/login', request.url));
  clearAuthCookies(response.cookies);

  return response;
}
