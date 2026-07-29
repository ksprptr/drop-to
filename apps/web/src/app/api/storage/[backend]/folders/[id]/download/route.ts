import { NextResponse } from 'next/server';

import { proxyDownload } from '@/common/services/api/passthrough.server';
import { isCrossSiteRequest } from '@/common/utils/request-origin';
import { assertBackend, seg } from '@/common/utils/storage-path';

/**
 * Streams a folder's contents as a ZIP archive from the API.
 **/
export async function GET(
  request: Request,
  { params }: { params: Promise<{ backend: string; id: string }> },
): Promise<Response> {
  // CSRF defense-in-depth: reject cross-site loads (same-origin and direct navigations pass).
  if (isCrossSiteRequest(request)) {
    return NextResponse.json({ message: 'Cross-site request rejected.' }, { status: 403 });
  }

  const { backend, id } = await params;

  return proxyDownload(
    `/storage/${assertBackend(backend)}/folders/${seg(id)}/download`,
    request.signal,
  );
}
