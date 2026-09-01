import 'server-only';

interface AppServerConfig {
  /** Display name of this instance — the wordmarks, the titles, the manifest and the OG image. */
  name: string;
  nodeEnv: {
    isProduction: boolean;
  };
  urls: {
    /** API base for server-to-server calls. */
    apiUrl: string;
    /** Public origin of this web app (canonical / OpenGraph / robots / manifest). */
    appUrl: string;
  };
}

// `name` is read per request and passed as a prop — a NEXT_PUBLIC_* would inline at build and hydrate mismatched.
export const appServerConfig: AppServerConfig = {
  name: process.env.APP_NAME?.trim() || 'DropTo',
  nodeEnv: {
    isProduction: process.env.NODE_ENV === 'production',
  },
  urls: {
    apiUrl: (process.env.API_URL ?? 'http://localhost:4000/api/v1').replace(/\/$/, ''),
    appUrl: (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, ''),
  },
};
