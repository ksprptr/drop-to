import 'server-only';
import { cookies, headers } from 'next/headers';

import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from '@/common/constants/auth.constants';
import { appServerConfig } from '@/configs/app/app.server-config';

/**
 * Builds an absolute API URL for a route-handler passthrough.
 * @param path - The API path (e.g. `/storage/drive/files/x/download`)
 * @returns The absolute URL
 */
export const apiUrl = (path: string): string => `${appServerConfig.urls.apiUrl}${path}`;

/**
 * Builds the request headers for a route-handler passthrough to the API: forwards
 * the operator session cookies and the real client IP. Used by the streaming
 * upload/download routes (which cannot go through the JSON `getHttp` client).
 * @param base - Optional base headers to extend
 * @returns The headers to send to the API
 */
export const apiAuthHeaders = async (base?: HeadersInit): Promise<Headers> => {
  const cookieStore = await cookies();
  const headersList = await headers();
  const result = new Headers(base);

  const parts: string[] = [];
  for (const name of [ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE]) {
    const value = cookieStore.get(name)?.value;
    if (value) {
      parts.push(`${name}=${value}`);
    }
  }
  if (parts.length > 0) {
    result.set('cookie', parts.join('; '));
  }

  const clientIp = headersList.get('cf-connecting-ip') ?? headersList.get('x-forwarded-for');
  if (clientIp) {
    result.set('x-forwarded-for', clientIp);
  }

  return result;
};

/** Response headers forwarded from the API on a download passthrough. */
const DOWNLOAD_HEADERS = ['content-type', 'content-disposition', 'content-length', 'accept-ranges'];

/**
 * Streams a GET download from the API back to the browser, forwarding the relevant
 * headers (content type, disposition, length). Used by the file/folder download
 * route handlers so the browser never hits the API directly.
 * @param path - The API path to stream
 * @param signal - The incoming request's abort signal
 * @returns A streamed Response
 */
export const proxyDownload = async (path: string, signal: AbortSignal): Promise<Response> => {
  const apiResponse = await fetch(apiUrl(path), { headers: await apiAuthHeaders(), signal });

  const outHeaders = new Headers();
  for (const name of DOWNLOAD_HEADERS) {
    const value = apiResponse.headers.get(name);
    if (value) {
      outHeaders.set(name, value);
    }
  }

  return new Response(apiResponse.body, { status: apiResponse.status, headers: outHeaders });
};
