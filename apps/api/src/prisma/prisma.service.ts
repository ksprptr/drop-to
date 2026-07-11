import { Inject, Injectable } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from 'prisma/generated/prisma/client';

import { type DatabaseConfig, databaseConfig } from '@/config/database.config';

/**
 * Class representing a prisma service
 */
@Injectable()
export class PrismaService extends PrismaClient {
  constructor(@Inject(databaseConfig.KEY) config: DatabaseConfig) {
    const adapter = new PrismaPg({ connectionString: config.url });

    super({ adapter });
  }
}
