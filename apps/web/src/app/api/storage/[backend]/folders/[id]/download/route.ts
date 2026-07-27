import { proxyDownload } from '@/common/services/api/passthrough.server';

/**
 * Streams a folder's contents as a ZIP archive from the API.
 **/
export async function GET(
  request: Request,
  { params }: { params: Promise<{ backend: string; id: string }> },
): Promise<Response> {
  const { backend, id } = await params;

  return proxyDownload(`/storage/${backend}/folders/${id}/download`, request.signal);
}
