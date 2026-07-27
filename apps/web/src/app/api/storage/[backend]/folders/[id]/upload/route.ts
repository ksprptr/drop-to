import { NextResponse } from 'next/server';

import { apiAuthHeaders, apiUrl } from '@/common/services/api/passthrough.server';

/**
 * Proxies a streamed upload to the API: raw body streamed through (no buffering, 10 GiB).
 **/
export async function POST(
  request: Request,
  { params }: { params: Promise<{ backend: string; id: string }> },
): Promise<Response> {
  const { backend, id } = await params;

  const headers = await apiAuthHeaders();
  const contentType = request.headers.get('content-type');
  if (contentType) {
    headers.set('content-type', contentType);
  }

  try {
    const apiResponse = await fetch(apiUrl(`/storage/${backend}/folders/${id}/upload`), {
      method: 'POST',
      body: request.body,
      headers,
      signal: request.signal,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });

    const body = await apiResponse.text();

    return new NextResponse(body, {
      status: apiResponse.status,
      headers: { 'content-type': apiResponse.headers.get('content-type') ?? 'application/json' },
    });
  } catch {
    return NextResponse.json({ message: 'Upload failed.' }, { status: 502 });
  }
}
