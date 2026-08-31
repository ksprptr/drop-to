import { Controller, Get } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  MemoryHealthIndicator,
  PrismaHealthIndicator,
} from '@nestjs/terminus';

import { Public } from '@/common/decorators/public.decorator';
import { RateLimit } from '@/common/services/rate-limit/decorators/rate-limit.decorator';
import { PrismaService } from '@/prisma/prisma.service';

const MEMORY_HEAP_THRESHOLD_BYTES = 512 * 1024 * 1024;

/**
 * API health: process heap usage + Postgres reachability.
 **/
// Public for the session-less probes, but limited rather than exempt (it reaches Postgres); a 429 reads as unhealthy.
@ApiExcludeController()
@RateLimit({ points: 120, duration: 60 })
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
