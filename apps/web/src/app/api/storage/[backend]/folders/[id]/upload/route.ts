import { NextResponse } from 'next/server';

import {
  apiAuthHeaders,
  apiUrl,
  resolveSessionForPassthrough,
} from '@/common/services/api/passthrough.server';
import { applyAuthCookies } from '@/common/services/auth/tokens.server';
import { isCrossSiteRequest } from '@/common/utils/request-origin';
import { assertBackend, seg } from '@/common/utils/storage-path';

/**
 * Proxies a streamed upload to the API: raw body streamed through (no buffering, 10 GiB).
 **/
export async function POST(
  request: Request,
  { params }: { params: Promise<{ backend: string; id: string }> },
): Promise<Response> {
  // CSRF defense-in-depth: reject cross-site POSTs (also protected by SameSite=lax cookies).
  if (isCrossSiteRequest(request)) {
    return NextResponse.json({ message: 'Cross-site request rejected.' }, { status: 403 });
  }

  const { backend, id } = await params;

  // Refresh the (possibly expired) access token before the stream starts, so the API authenticates
  // this long-running upload at its start; rotated cookies are written back to the browser below.
  const session = await resolveSessionForPassthrough();
  const headers = await apiAuthHeaders(undefined, session.cookieHeader ?? undefined);
  const contentType = request.headers.get('content-type');
  if (contentType) {
    headers.set('content-type', contentType);
  }

  try {
    const apiResponse = await fetch(apiUrl(`/storage/${assertBackend(backend)}/folders/${seg(id)}/upload`), {
      method: 'POST',
      body: request.body,
      headers,
      signal: request.signal,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });

    const body = await apiResponse.text();

    const response = new NextResponse(body, {
      status: apiResponse.status,
      headers: { 'content-type': apiResponse.headers.get('content-type') ?? 'application/json' },
    });
    applyAuthCookies(response.cookies, session.rotated);

    return response;
  } catch {
    return NextResponse.json({ message: 'Upload failed.' }, { status: 502 });
  }
}
