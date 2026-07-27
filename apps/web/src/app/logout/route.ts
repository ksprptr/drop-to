import { NextRequest, NextResponse } from 'next/server';

import { clearAuthCookies } from '@/common/services/auth/tokens.server';
import { getHttp } from '@/common/services/axios/axios.instance';

/**
 * Best-effort revokes the session at the API, clears the auth cookies and redirects to login.
 **/
export async function GET(request: NextRequest): Promise<NextResponse> {
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
