import { INestApplication } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';

import { AppModule } from '@/app.module';
import { configureApp } from '@/app.setup';
import { PrismaService } from '@/prisma/prisma.service';

import { PrismaMock } from './prisma.mock';

/**
 * Boots the full AppModule for integration tests with PrismaService mocked.
 **/
// The same `configureApp` call `main.ts` makes, so the suite exercises the real pipeline, not a copied subset.
export async function createTestApp(prisma: PrismaMock): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .compile();

  // `logger: false` keeps test output clean (health/error paths log otherwise).
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });

  configureApp(app);

  await app.init();

  return app;
}
