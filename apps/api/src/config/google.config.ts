import { registerAs } from '@nestjs/config';

export const googleConfig = registerAs('google', () => ({
  clientId: process.env['GOOGLE_CLIENT_ID']!,
  clientSecret: process.env['GOOGLE_CLIENT_SECRET']!,
  redirectUri: process.env['GOOGLE_REDIRECT_URI']!,
  // Restricted Drive scope: the app can only access files and folders it created
  // or that the user explicitly opened/selected via the Google Picker.
  // `openid`/`email` are added only to identify which account was authorized —
  // they grant no Drive access.
  scopes: [
    'openid',
    'email',
    'https://www.googleapis.com/auth/drive.file',
  ] as const,
}));

export type GoogleConfig = ReturnType<typeof googleConfig>;
