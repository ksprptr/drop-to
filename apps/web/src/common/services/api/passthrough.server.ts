import 'server-only';
import { cookies, headers } from 'next/headers';

import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from '@/common/constants/auth.constants';
import { appServerConfig } from '@/configs/app/app.server-config';

/**
 * Absolute API URL for a route-handler passthrough.
 **/
export const apiUrl = (path: string): string => `${appServerConfig.urls.apiUrl}${path}`;

/**
 * Passthrough request headers to the API: forwards session cookies and the client IP.
 **/
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

const DOWNLOAD_HEADERS = ['content-type', 'content-disposition', 'content-length', 'accept-ranges'];

/**
 * Streams a GET download from the API back to the browser, forwarding the key headers.
 **/
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
