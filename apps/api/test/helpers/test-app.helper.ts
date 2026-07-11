import { INestApplication, RequestMethod, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';

import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma/prisma.service';

import { PrismaMock } from './prisma.mock';

/**
 * Boots the full AppModule for integration tests with PrismaService mocked.
 *
 * Mirrors main.ts wiring (trust proxy, global prefix, cookie parser, ValidationPipe);
 * the global AuthGuard, RateLimitGuard and exception filter come from the module tree.
 * The app has no background workers or crons, so `init()` is safe and deterministic.
 */
export async function createTestApp(prisma: PrismaMock): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .compile();

  // `logger: false` keeps test output clean (health/error paths log otherwise).
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });

  app.set('trust proxy', 1);
  app.setGlobalPrefix('/api/v1', {
    exclude: [{ path: 'health', method: RequestMethod.GET }],
  });
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  await app.init();

  return app;
}
