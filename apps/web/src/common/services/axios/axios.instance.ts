import 'server-only';
import { type AxiosInstance, create } from 'axios';
import { cookies, headers } from 'next/headers';

import {
  ACCESS_TOKEN_COOKIE,
  DRIVE_OWNER_COOKIE,
  REFRESH_TOKEN_COOKIE,
} from '@/common/constants/auth.constants';
import { ApiUnavailableError } from '@/common/services/axios/axios.errors';
import { appServerConfig } from '@/configs/app/app.server-config';

// Server-only axios for the API, scoped to the request's cookies; tokens never reach the browser.
export const getHttp = async (): Promise<AxiosInstance> => {
  const cookieStore = await cookies();
  const headersList = await headers();

  const http = create({
    baseURL: appServerConfig.urls.apiUrl,
    headers: { 'Content-Type': 'application/json' },
    withCredentials: true,
    timeout: 30_000,
  });

  http.interceptors.request.use((config) => {
    const parts: string[] = [];

    for (const name of [ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE, DRIVE_OWNER_COOKIE]) {
      const value = cookieStore.get(name)?.value;
      if (value) {
        parts.push(`${name}=${value}`);
      }
    }

    if (parts.length > 0) {
      config.headers.set('Cookie', parts.join('; '));
    }

    // Forward the real client IP so the API's IP-keyed rate limiter isn't blind.
    const clientIp = headersList.get('cf-connecting-ip') ?? headersList.get('x-forwarded-for');
    if (clientIp) {
      config.headers.set('X-Forwarded-For', clientIp);
    }

    // Drop JSON content-type for multipart so the boundary is kept.
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
