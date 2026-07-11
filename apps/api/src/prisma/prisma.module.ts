import { Global, Module } from '@nestjs/common';

import { PrismaService } from './prisma.service';

/**
 * Class representing a prisma module
 */
@Global()
@Module({
  exports: [PrismaService],
  providers: [PrismaService],
})
export class PrismaModule {}
