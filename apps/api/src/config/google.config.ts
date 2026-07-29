import { registerAs } from '@nestjs/config';

export const googleConfig = registerAs('google', () => ({
  clientId: process.env['GOOGLE_CLIENT_ID']!,
  clientSecret: process.env['GOOGLE_CLIENT_SECRET']!,
  redirectUri: process.env['GOOGLE_REDIRECT_URI']!,
  scopes: ['openid', 'email', 'https://www.googleapis.com/auth/drive'] as const,
}));

export type GoogleConfig = ReturnType<typeof googleConfig>;
