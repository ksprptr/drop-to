import { NextResponse } from 'next/server';

import { apiAuthHeaders, apiUrl } from '@/common/services/api/passthrough.server';

/**
 * Route handler proxying a streamed file upload to the API. The browser posts here
 * (same-origin) so it gets upload progress + abort; the raw multipart body is
 * streamed straight through to the API without buffering (10 GiB uploads), never
 * exposing the API to the browser directly.
 */
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
      // Required when streaming a request body via fetch.
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
