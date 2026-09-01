import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

import { type AppConfig, appConfig } from './config/app.config';

/**
 * Applies every request-shaping concern the app needs, in the order they must run.
 **/
// Shared with the e2e harness so the two cannot drift; a middleware the test app skips stops being covered.
export function configureApp(app: NestExpressApplication): void {
  const appCfg = app.get<AppConfig>(appConfig.KEY);

  // Behind a reverse proxy — hop count is configurable so `req.ip` (rate-limit key) resolves to the real client.
  app.set('trust proxy', appCfg.trustProxyHops);

  app.setGlobalPrefix(appCfg.apiPrefix, {
    exclude: [{ path: 'health', method: RequestMethod.GET }],
  });

  // CSP disabled: JSON API with no first-party HTML, and a default CSP would break dev Swagger UI.
  app.use(helmet({ contentSecurityPolicy: false }));

  app.use(cookieParser());

  app.enableCors({
    origin: appCfg.corsAllowedOrigins,
    methods: 'GET,POST,PATCH,DELETE,HEAD,OPTIONS',
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
}
