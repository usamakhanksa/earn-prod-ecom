import { Body, Controller, Delete, Get, Header, Param, Patch, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { createVideoContentSchema, updateVideoContentSchema } from '@omnisell/shared';
import { VideoContentService } from './video-content.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContextGuard } from '../auth/tenant-context.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import type { TenantContext } from '../auth/tenant-context.guard';
import { PoliciesGuard } from '../rbac/policies.guard';
import { CheckPolicies } from '../rbac/check-policies.decorator';

/** Video content management (docs/points-extension.md §9.4/§10.3 —
 * "admin/tenant operator"). CRUD is RBAC-gated (DESIGNER/ADMIN/OWNER can
 * write, per `AbilityFactory`); reads (browsing active videos) are open to
 * any authenticated tenant member, including Consumer Mode's video feed. */
@Controller('videos')
@UseGuards(JwtAuthGuard, TenantContextGuard)
export class VideoContentController {
  constructor(private readonly videos: VideoContentService) {}

  @Get()
  async list(@CurrentTenant() tenant: TenantContext) {
    return this.videos.listActive(tenant.tenantId);
  }

  /** Moderation view (task 4.5.8) — includes archived/inactive rows. */
  @Get('all')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('read', 'VideoContent'))
  async listAll(@CurrentTenant() tenant: TenantContext) {
    return this.videos.listAll(tenant.tenantId);
  }

  @Get(':id')
  async findById(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.videos.findById(tenant.tenantId, id);
  }

  @Post()
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('create', 'VideoContent'))
  async create(@CurrentTenant() tenant: TenantContext, @Body() body: unknown) {
    const input = createVideoContentSchema.parse(body);
    return this.videos.create(tenant.tenantId, input);
  }

  @Patch(':id')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('update', 'VideoContent'))
  async update(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() body: unknown) {
    const input = updateVideoContentSchema.parse(body);
    return this.videos.update(tenant.tenantId, id, input);
  }

  /** Archive, never a hard delete (matches the base catalog convention). */
  @Delete(':id')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('delete', 'VideoContent'))
  async archive(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.videos.archive(tenant.tenantId, id);
  }

  /** Disk-backed stand-in stream (same class as 2-D2/2-D14 — no live
   * CDN/S3 in this sandbox). Real bytes, real content-type; not a signed
   * URL, not range-request-capable yet (documented as new debt). */
  @Get('blob/:sessionId')
  @Header('Content-Type', 'video/mp4')
  async streamBlob(@CurrentTenant() tenant: TenantContext, @Param('sessionId') sessionId: string, @Res() res: Response) {
    const buffer = await this.videos.readBlob(tenant.tenantId, sessionId);
    res.send(buffer);
  }
}
