import { registerAs } from '@nestjs/config';

// Google Drive backend. `enabled` is a kill-switch; the OAuth credentials are validated only when enabled.
export const googleConfig = registerAs('google', () => {
  const enabled = process.env['GOOGLE_ENABLED'] === 'true';

  if (enabled) {
    const missing = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'].filter(
      (key) => !process.env[key],
    );
    if (missing.length > 0) {
      throw new Error(
        `Google Drive is enabled but missing required variables: ${missing.join(', ')}`,
      );
    }
  }

  return {
    enabled,
    clientId: process.env['GOOGLE_CLIENT_ID']!,
    clientSecret: process.env['GOOGLE_CLIENT_SECRET']!,
    redirectUri: process.env['GOOGLE_REDIRECT_URI']!,
    scopes: ['openid', 'email', 'https://www.googleapis.com/auth/drive'] as const,
  };
});

export type GoogleConfig = ReturnType<typeof googleConfig>;
