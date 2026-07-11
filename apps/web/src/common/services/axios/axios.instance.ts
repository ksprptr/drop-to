import axios, { AxiosError } from 'axios';

import { getEnvString } from '@/common/utils/environments.functions';

import { ApiUnavailableError } from './axios.errors';

/**
 * Shared axios instance for talking to the DropTo API.
 *
 * Auth tokens live in httpOnly cookies, so `withCredentials` is on for every call.
 * A response interceptor normalizes unreachable-server errors, retries a dropped
 * connection once, and — on a 401 — silently rotates the token via `/auth/refresh`
 * before retrying, redirecting to `/login` when the session is truly gone.
 */
export const http = axios.create({
  baseURL: getEnvString({ key: 'NEXT_PUBLIC_API_URL', fallback: 'http://localhost:4000/api/v1' }),
  timeout: 30000,
  withCredentials: true,
});

// Endpoints that must never trigger the silent-refresh flow (they ARE the flow).
const AUTH_ENDPOINTS = ['/auth/login', '/auth/refresh', '/auth/logout'];

/**
 * Redirects the browser to the login page (no-op on the server or when already there).
 */
const redirectToLogin = (): void => {
  if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
    window.location.href = '/login';
  }
};

http.interceptors.response.use(
  (response) => response,
  async (
    error: AxiosError & { config?: { __isRetry?: boolean; __isAuthRetry?: boolean; url?: string } },
  ) => {
    if (error.code === 'ERR_NETWORK') {
      return Promise.reject(new ApiUnavailableError());
    }

    if (error.code === 'ECONNRESET' && error.config && !error.config.__isRetry) {
      error.config.__isRetry = true;
      return http.request(error.config);
    }

    const config = error.config;
    const url = config?.url ?? '';
    const isAuthEndpoint = AUTH_ENDPOINTS.some((endpoint) => url.includes(endpoint));

    if (error.response?.status === 401 && config && !config.__isAuthRetry && !isAuthEndpoint) {
      config.__isAuthRetry = true;

      try {
        await http.post('/auth/refresh');
        return await http.request(config);
      } catch {
        redirectToLogin();
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  },
);
