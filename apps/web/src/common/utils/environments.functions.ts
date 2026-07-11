/**
 * Typed reader for public (browser-exposed) environment variables.
 *
 * `NEXT_PUBLIC_*` vars are inlined at build time, so they must be referenced by
 * their full static name — this helper centralizes the lookup and fallback.
 */
interface EnvOptions {
  key: string;
  fallback?: string;
}

const PUBLIC_ENV: Record<string, string | undefined> = {
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_GOOGLE_API_KEY: process.env.NEXT_PUBLIC_GOOGLE_API_KEY,
  NEXT_PUBLIC_GOOGLE_CLIENT_ID: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
  NEXT_PUBLIC_GOOGLE_APP_ID: process.env.NEXT_PUBLIC_GOOGLE_APP_ID,
};

/**
 * Function to read a public environment variable as a string.
 * @param options - The variable key and an optional fallback
 * @returns The variable value, or the fallback (defaults to an empty string)
 */
export const getEnvString = ({ key, fallback = '' }: EnvOptions): string => {
  return PUBLIC_ENV[key] ?? fallback;
};
