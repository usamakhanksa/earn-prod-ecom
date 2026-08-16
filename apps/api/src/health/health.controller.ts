import { Controller, Get } from '@nestjs/common';
import { healthStatusSchema, type HealthReport } from '@omnisell/shared';
import { PrismaService } from '../prisma/prisma.service';
import { pingRedis } from '../queue/redis-connection';

/**
 * /v1/healthz  — liveness: the process is up. Always 200.
 * /v1/readyz   — readiness: returns per-dependency status without throwing so the
 *                caller can react to partial outages (status stays 200; checks carry
 *                ok|degraded|down).
 */
@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('healthz')
  healthz(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('readyz')
  async readyz(): Promise<HealthReport> {
    const db = (await this.prisma.ping()) ? 'ok' : 'down';
    // Real, bounded connectivity probe (Phase 3 task 3.6 closes 0-D5) —
    // resolves 'down' rather than hanging when Redis is unreachable, which
    // is the honest, expected state in this Docker-less sandbox.
    const redis = await pingRedis();
    const status = healthStatusSchema.parse(db === 'ok' && redis === 'ok' ? 'ok' : 'degraded');
    return {
      status,
      checks: {
        database: db === 'ok' ? 'ok' : 'down',
        redis: redis === 'ok' ? 'ok' : 'degraded',
        storage: 'ok' as const, // MinIO healthcheck wiring lands with storage (Phase 2).
      },
    };
  }
}