import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { type AppConfig, appConfig } from './config/app.config';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  const appCfg = app.get<AppConfig>(appConfig.KEY);

  // Everything a request passes through lives in `configureApp`, shared with the e2e harness.
  configureApp(app);

  if (appCfg.isDevelopment) {
    const config = new DocumentBuilder()
      .setTitle('DropTo API')
      .addCookieAuth('accessToken')
      .build();
    const documentFactory = () => SwaggerModule.createDocument(app, config);

    SwaggerModule.setup('swagger', app, documentFactory, { jsonDocumentUrl: 'swagger/json' });
  }

  await app.listen(appCfg.port);
}

bootstrap();
