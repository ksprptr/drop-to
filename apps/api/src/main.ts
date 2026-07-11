import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';

import { AppModule } from './app.module';
import { type AppConfig, appConfig } from './config/app.config';

/**
 * Function to bootstrap the NestJS application
 */
async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  const appCfg = app.get<AppConfig>(appConfig.KEY);

  // Trust proxy configuration (behind Coolify / reverse proxy)
  app.set('trust proxy', 1);

  // Global prefix configuration
  app.setGlobalPrefix(appCfg.apiPrefix, {
    exclude: [{ path: 'health', method: RequestMethod.GET }],
  });

  // Cookie parser middleware (auth tokens travel in httpOnly cookies)
  app.use(cookieParser());

  // CORS configuration
  app.enableCors({
    origin: appCfg.corsAllowedOrigins,
    methods: 'GET,POST,PATCH,DELETE,HEAD,OPTIONS',
    credentials: true,
  });

  // Swagger documentation (development only)
  if (appCfg.isDevelopment) {
    const config = new DocumentBuilder()
      .setTitle('DropTo API')
      .addCookieAuth('accessToken')
      .build();
    const documentFactory = () => SwaggerModule.createDocument(app, config);

    SwaggerModule.setup('swagger', app, documentFactory, { jsonDocumentUrl: 'swagger/json' });
  }

  // Global validation pipe
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
