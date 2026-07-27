import 'server-only';

interface AppServerConfig {
  nodeEnv: {
    isProduction: boolean;
    isDevelopment: boolean;
  };
  urls: {
    /** Base URL the server uses to reach the DropTo API (server-to-server). */
    apiUrl: string;
    /** Public origin of this web app (canonical URL, OpenGraph, robots, manifest). */
    appUrl: string;
  };
  /** Cookie domain applied to auth cookies (set in production only). */
  cookieDomain: string;
}

/**
 * App configuration (server-side only). The API base URL prefers a server-only
 * `API_URL` (internal address) and falls back to the public one; the cookie
 * domain must be a shared parent in production so the Next server and the API
 * can both read/write the auth cookies.
 */
export const appServerConfig: AppServerConfig = {
  nodeEnv: {
    isProduction: process.env.NODE_ENV === 'production',
    isDevelopment: process.env.NODE_ENV === 'development',
  },
  urls: {
    apiUrl: (
      process.env.API_URL ??
      process.env.NEXT_PUBLIC_API_URL ??
      'http://localhost:4000/api/v1'
    ).replace(/\/$/, ''),
    appUrl: (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, ''),
  },
  cookieDomain: process.env.COOKIE_DOMAIN ?? 'localhost',
};
