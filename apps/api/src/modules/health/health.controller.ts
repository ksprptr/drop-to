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
// Stays `@Public()` — the Docker/Coolify probes have no session and authenticating them would only
// mean the probe fails for the wrong reason. It is rate limited rather than exempt, though: the
// check reaches Postgres, so an unauthenticated caller could otherwise turn a cheap request into
// unbounded DB round-trips. The limiter keys on IP, so a flood from anywhere else cannot exhaust
// the probe's own budget.
//
// The 30 s `HEALTHCHECK` interval spends 2/min, so the budget is deliberately ~60x that rather than
// merely sufficient: the failure mode of a too-tight limit is a 429 the platform reads as unhealthy,
// which restarts a perfectly fine container. Headroom costs nothing here; a false restart does.
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
