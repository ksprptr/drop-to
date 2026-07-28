import { NextResponse } from 'next/server';

import { proxyDownload } from '@/common/services/api/passthrough.server';
import { isCrossSiteRequest } from '@/common/utils/request-origin';
import { assertBackend, seg } from '@/common/utils/storage-path';

/**
 * Streams a file download from the API (also the `<img>` source for previews).
 **/
export async function GET(
  request: Request,
  { params }: { params: Promise<{ backend: string; id: string }> },
): Promise<Response> {
  // CSRF defense-in-depth: reject cross-site loads (same-origin `<img>`/downloads report
  // `same-origin`; direct navigations report `none` — both pass).
  if (isCrossSiteRequest(request)) {
    return NextResponse.json({ message: 'Cross-site request rejected.' }, { status: 403 });
  }

  const { backend, id } = await params;

  return proxyDownload(
    `/storage/${assertBackend(backend)}/files/${seg(id)}/download`,
    request.signal,
  );
}
