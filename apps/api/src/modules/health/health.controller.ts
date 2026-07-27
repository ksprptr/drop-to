import { Controller, Get } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  MemoryHealthIndicator,
  PrismaHealthIndicator,
} from '@nestjs/terminus';

import { Public } from '@/common/decorators/public.decorator';
import { SkipRateLimit } from '@/common/services/rate-limit/decorators/skip-rate-limit.decorator';
import { PrismaService } from '@/prisma/prisma.service';

const MEMORY_HEAP_THRESHOLD_BYTES = 512 * 1024 * 1024;

/**
 * API health: process heap usage + Postgres reachability.
 **/
@ApiExcludeController()
@SkipRateLimit()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly memory: MemoryHealthIndicator,
    private readonly prisma: PrismaService,
    private readonly prismaHealth: PrismaHealthIndicator,
  ) {}

  @Public()
  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.memory.checkHeap('memory_heap', MEMORY_HEAP_THRESHOLD_BYTES),
      () => this.prismaHealth.pingCheck('postgres', this.prisma),
    ]);
  }
}
