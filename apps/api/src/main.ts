import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { type AppConfig, appConfig } from './config/app.config';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

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

  if (appCfg.isDevelopment) {
    const config = new DocumentBuilder()
      .setTitle('DropTo API')
      .addCookieAuth('accessToken')
      .build();
    const documentFactory = () => SwaggerModule.createDocument(app, config);

    SwaggerModule.setup('swagger', app, documentFactory, { jsonDocumentUrl: 'swagger/json' });
  }

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(appCfg.port);
}

bootstrap();
