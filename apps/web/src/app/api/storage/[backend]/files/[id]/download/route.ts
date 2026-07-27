import { proxyDownload } from '@/common/services/api/passthrough.server';

/**
 * Route handler streaming a single file download from the API (used both by the
 * download action and as the `<img>` source for image previews). Cookie-auth'd
 * same-origin, forwarded server-to-server to the API.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ backend: string; id: string }> },
): Promise<Response> {
  const { backend, id } = await params;

  return proxyDownload(`/storage/${backend}/files/${id}/download`, request.signal);
}
