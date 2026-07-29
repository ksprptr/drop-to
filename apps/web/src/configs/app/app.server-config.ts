import 'server-only';

interface AppServerConfig {
  nodeEnv: {
    isProduction: boolean;
  };
  urls: {
    /** API base for server-to-server calls. */
    apiUrl: string;
    /** Public origin of this web app (canonical / OpenGraph / robots / manifest). */
    appUrl: string;
  };
  /** Auth-cookie domain (production only; a shared parent so app + API share cookies). */
  cookieDomain: string;
}

// Server-side config. apiUrl prefers a server-only API_URL, else the public one.
export const appServerConfig: AppServerConfig = {
  nodeEnv: {
    isProduction: process.env.NODE_ENV === 'production',
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
