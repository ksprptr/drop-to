import { proxyPublicFile } from '@/common/services/api/passthrough.server';
import { seg } from '@/common/utils/storage-path.functions';

/**
 * Serves a file behind a public share token — the app's only unauthenticated content route.
 **/
// The trailing `name` segment is cosmetic: it keeps the file's extension in the URL so images
// preview inline in chat apps. Only the token identifies the file, so the name is never read here.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await params;

  return proxyPublicFile(`/public/${seg(token)}`, request.signal);
}
