import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { completeVideoWatchSchema, startVideoWatchSchema, videoWatchHeartbeatSchema } from '@omnisell/shared';
import { VideoWatchService } from './video-watch.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContextGuard } from '../auth/tenant-context.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import type { TenantContext } from '../auth/tenant-context.guard';

/**
 * Video watch pipeline (docs/points-extension.md §9.2 — "internal, strict").
 * Every mutation is scoped to the caller's own watch session; ownership is
 * enforced inside `VideoWatchService` (a watch row belonging to another user
 * or tenant is a 404, never a 403 that would leak its existence).
 */
@Controller('video-watches')
@UseGuards(JwtAuthGuard, TenantContextGuard)
export class VideoWatchController {
  constructor(private readonly videoWatches: VideoWatchService) {}

  @Post()
  async start(@CurrentTenant() tenant: TenantContext, @Body() body: unknown, @Req() request: Request) {
    const input = startVideoWatchSchema.parse(body);
    return this.videoWatches.start(tenant.tenantId, tenant.userId, {
      videoId: input.videoId,
      ...(input.deviceFingerprint !== undefined ? { deviceFingerprint: input.deviceFingerprint } : {}),
      ipAddress: request.ip ?? null,
    });
  }

  @Post(':id/heartbeat')
  async heartbeat(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() body: unknown) {
    const input = videoWatchHeartbeatSchema.parse(body);
    return this.videoWatches.heartbeat(tenant.tenantId, tenant.userId, id, input);
  }

  @Post(':id/complete')
  async complete(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() body: unknown) {
    const input = completeVideoWatchSchema.parse(body);
    return this.videoWatches.complete(tenant.tenantId, tenant.userId, id, input);
  }
}
