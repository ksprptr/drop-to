import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { createPrismaMock, PrismaMock, resetPrismaMock } from '../helpers/prisma.mock';
import { createTestApp } from '../helpers/test-app.helper';

jest.mock('googleapis', () => require('../helpers/googleapis.mock').createGoogleApisMock());

describe('Health (integration)', () => {
  let app: INestApplication;
  const prisma: PrismaMock = createPrismaMock();

  beforeAll(async () => {
    app = await createTestApp(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    resetPrismaMock(prisma);
  });

  it('returns 200 without an api key (public, off the global prefix)', async () => {
    const res = await request(app.getHttpServer()).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.info.postgres.status).toBe('up');
  });

  it('returns 503 when Postgres is unreachable', async () => {
    prisma.$queryRawUnsafe.mockRejectedValue(new Error('connection refused'));

    const res = await request(app.getHttpServer()).get('/health');

    // GlobalExceptionFilter normalizes the 503 into { status, message }; `message` holds the payload.
    expect(res.status).toBe(503);
    expect(res.body.message.error.postgres.status).toBe('down');
  });
});
