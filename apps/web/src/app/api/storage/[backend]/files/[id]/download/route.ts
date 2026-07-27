import { proxyDownload } from '@/common/services/api/passthrough.server';

/**
 * Streams a file download from the API (also the `<img>` source for previews).
 **/
export async function GET(
  request: Request,
  { params }: { params: Promise<{ backend: string; id: string }> },
): Promise<Response> {
  const { backend, id } = await params;

  return proxyDownload(`/storage/${backend}/files/${id}/download`, request.signal);
}
