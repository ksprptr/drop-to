import { proxyDownload } from '@/common/services/api/passthrough.server';
import { assertBackend, seg } from '@/common/utils/storage-path';

/**
 * Streams a file download from the API (also the `<img>` source for previews).
 **/
export async function GET(
  request: Request,
  { params }: { params: Promise<{ backend: string; id: string }> },
): Promise<Response> {
  const { backend, id } = await params;

  return proxyDownload(
    `/storage/${assertBackend(backend)}/files/${seg(id)}/download`,
    request.signal,
  );
}
