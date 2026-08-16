import { Controller, Get, Param, Post, Sse, UseGuards, type MessageEvent } from '@nestjs/common';
import { map } from 'rxjs/operators';
import type { Observable } from 'rxjs';
import type { SyncJobView } from '@omnisell/shared';
import { SyncJobsService } from './sync-jobs.service';
import { createSyncJobStream } from './sync-job-stream';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { TenantContextGuard, type TenantContext } from '../../auth/tenant-context.guard';
import { CurrentTenant } from '../../auth/current-tenant.decorator';

/**
 * Publish pipeline view backend (prompt.md "signature moment #2" /
 * implentationplanphase.md task 4.6) — `GET /sync-jobs/:id` is a real SSE
 * stream (`createSyncJobStream`, fully unit-tested independent of HTTP —
 * see `test/sync-job-stream.test.ts`). `GET /sync-jobs/:id/snapshot` is a
 * plain JSON convenience the web UI/curl can use for the initial paint
 * before opening the `EventSource` connection, and for straightforward
 * smoke-testing in this sandbox (no real browser here, docs/DEBT.md).
 */
@Controller('sync-jobs')
@UseGuards(JwtAuthGuard, TenantContextGuard)
export class SyncJobsController {
  constructor(private readonly syncJobs: SyncJobsService) {}

  @Get()
  async list(@CurrentTenant() tenant: TenantContext): Promise<SyncJobView[]> {
    return this.syncJobs.list(tenant.tenantId);
  }

  @Get(':id/snapshot')
  async snapshot(@CurrentTenant() tenant: TenantContext, @Param('id') id: string): Promise<SyncJobView> {
    return this.syncJobs.get(tenant.tenantId, id);
  }

  @Sse(':id')
  stream(@CurrentTenant() tenant: TenantContext, @Param('id') id: string): Observable<MessageEvent> {
    return createSyncJobStream(() => this.syncJobs.get(tenant.tenantId, id)).pipe(map((job) => ({ data: job, type: 'sync-job-update' })));
  }

  @Post(':id/replay')
  async replay(@CurrentTenant() tenant: TenantContext, @Param('id') id: string): Promise<{ replayed: number }> {
    return this.syncJobs.replay(tenant.tenantId, id, tenant.userId);
  }
}
