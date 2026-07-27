import { proxyDownload } from '@/common/services/api/passthrough.server';
import { assertBackend, seg } from '@/common/utils/storage-path';

/**
 * Streams a folder's contents as a ZIP archive from the API.
 **/
export async function GET(
  request: Request,
  { params }: { params: Promise<{ backend: string; id: string }> },
): Promise<Response> {
  const { backend, id } = await params;

  return proxyDownload(
    `/storage/${assertBackend(backend)}/folders/${seg(id)}/download`,
    request.signal,
  );
}
