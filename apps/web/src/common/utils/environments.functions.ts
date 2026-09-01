interface EnvOptions {
  key: string;
  fallback?: string;
}

const PUBLIC_ENV: Record<string, string | undefined> = {
  NEXT_PUBLIC_GOOGLE_API_KEY: process.env.NEXT_PUBLIC_GOOGLE_API_KEY,
  NEXT_PUBLIC_GOOGLE_APP_ID: process.env.NEXT_PUBLIC_GOOGLE_APP_ID,
};

/**
 * Reads a public env var, falling back to `fallback` (default `''`).
 **/
export const getEnvString = ({ key, fallback = '' }: EnvOptions): string => {
  return PUBLIC_ENV[key] ?? fallback;
};
