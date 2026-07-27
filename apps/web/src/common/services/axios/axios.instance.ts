import 'server-only';
import axios, { type AxiosInstance } from 'axios';
import { cookies, headers } from 'next/headers';

import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from '@/common/constants/auth.constants';
import { ApiUnavailableError } from '@/common/services/axios/axios.errors';
import { appServerConfig } from '@/configs/app/app.server-config';

/**
 * Builds a server-side axios instance for talking to the DropTo API.
 *
 * Auth rides in httpOnly cookies, so on every call we forward the session cookies
 * from the incoming request (`cookies()`). This must only be called from Server
 * Components, Server Actions or Route Handlers — tokens never reach the browser,
 * and the API is only ever reached server-to-server, never directly from a browser.
 * @returns A configured axios instance scoped to the current request's cookies
 */
export const getHttp = async (): Promise<AxiosInstance> => {
  const cookieStore = await cookies();
  const headersList = await headers();

  const http = axios.create({
    baseURL: appServerConfig.urls.apiUrl,
    headers: { 'Content-Type': 'application/json' },
    withCredentials: true,
    timeout: 30_000,
  });

  http.interceptors.request.use((config) => {
    const parts: string[] = [];

    for (const name of [ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE]) {
      const value = cookieStore.get(name)?.value;
      if (value) {
        parts.push(`${name}=${value}`);
      }
    }

    if (parts.length > 0) {
      config.headers.set('Cookie', parts.join('; '));
    }

    // Forward the real end-user IP — this call is server-to-server, so without it
    // the API's IP-keyed rate limiter would only ever see this container's address.
    const clientIp = headersList.get('cf-connecting-ip') ?? headersList.get('x-forwarded-for');
    if (clientIp) {
      config.headers.set('X-Forwarded-For', clientIp);
    }

    // For multipart uploads, drop the default JSON content-type so the boundary is kept.
    if (config.data instanceof FormData) {
      config.headers.delete('Content-Type');
    }

    return config;
  });

  http.interceptors.response.use(
    (response) => response,
    async (error) => {
      if (error.code === 'ERR_NETWORK') {
        return Promise.reject(new ApiUnavailableError());
      }

      if (error.code === 'ECONNRESET' && error.config && !error.config.__isRetry) {
        error.config.__isRetry = true;
        return http.request(error.config);
      }

      return Promise.reject(error);
    },
  );

  return http;
};
