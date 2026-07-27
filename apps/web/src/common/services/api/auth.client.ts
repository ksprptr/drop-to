import { getEnvString } from '@/common/utils/environments.functions';

/**
 * Client-side auth helper. The Google OAuth consent flow is a browser navigation
 * straight to the API's public redirect endpoint, so this URL is built on the
 * client from the public API base.
 * @returns The absolute `/google-auth/google` URL on the API
 */
export const getGoogleAuthUrl = (): string => {
  const base = getEnvString({ key: 'NEXT_PUBLIC_API_URL', fallback: 'http://localhost:4000/api/v1' });

  return `${base.replace(/\/$/, '')}/google-auth/google`;
};
