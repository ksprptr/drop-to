import { registerAs } from '@nestjs/config';

export const appConfig = registerAs('app', () => ({
  port: parseInt(process.env['APP_PORT']!, 10),
  nodeEnv: process.env['NODE_ENV']!,
  isProduction: process.env['NODE_ENV'] === 'production',
  isDevelopment: process.env['NODE_ENV'] === 'development',
  apiPrefix: '/api/v1' as const,
  corsAllowedOrigins: process.env['CORS_ALLOWED_ORIGINS']!.split(',').map((s) => s.trim()),
  webAppUrl: process.env['WEB_APP_URL']!,
}));

export type AppConfig = ReturnType<typeof appConfig>;
