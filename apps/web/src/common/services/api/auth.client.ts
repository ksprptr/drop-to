import { getEnvString } from '@/common/utils/environments.functions';

/**
 * Absolute API URL that starts the Google OAuth consent flow (browser navigates to it).
 **/
export const getGoogleAuthUrl = (): string => {
  const base = getEnvString({
    key: 'NEXT_PUBLIC_API_URL',
    fallback: 'http://localhost:4000/api/v1',
  });

  return `${base.replace(/\/$/, '')}/google-auth/google`;
};
