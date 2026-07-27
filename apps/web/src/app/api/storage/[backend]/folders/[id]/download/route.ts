import { proxyDownload } from '@/common/services/api/passthrough.server';

/**
 * Route handler streaming a folder's contents as a ZIP archive from the API.
 * Cookie-auth'd same-origin, forwarded server-to-server to the API.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ backend: string; id: string }> },
): Promise<Response> {
  const { backend, id } = await params;

  return proxyDownload(`/storage/${backend}/folders/${id}/download`, request.signal);
}
