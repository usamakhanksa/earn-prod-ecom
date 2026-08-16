import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import type {
  AssetSummary,
  AssetVersionSummary,
  CollectionSummary,
  FolderSummary,
  PreflightReportResult,
  UploadInitResult,
} from '@omnisell/shared';
import {
  addAssetToCollectionSchema,
  completePresignedUploadSchema,
  createCollectionSchema,
  createFolderSchema,
  initUploadSchema,
  listAssetsQuerySchema,
  rollbackAssetSchema,
  runPreflightSchema,
  updateAssetSchema,
  uploadChunkSchema,
} from '@omnisell/shared';
import { AssetsService } from './assets.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { TenantContextGuard, type TenantContext } from '../../auth/tenant-context.guard';
import { CurrentTenant } from '../../auth/current-tenant.decorator';
import { PoliciesGuard } from '../../rbac/policies.guard';
import { CheckPolicies } from '../../rbac/check-policies.decorator';
import { IdempotencyService } from '../../common/idempotency/idempotency.service';

@Controller()
@UseGuards(JwtAuthGuard, TenantContextGuard)
export class AssetsController {
  constructor(
    private readonly assets: AssetsService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Post('assets/upload-init')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('create', 'Asset'))
  async initUpload(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<UploadInitResult> {
    const input = initUploadSchema.parse(body);
    const result = await this.idempotency.run(
      { scope: 'asset.upload-init', key: idempotencyKey, ownerId: tenant.userId, requestBody: input },
      async () => ({ status: 201, body: await this.assets.initUpload(tenant.tenantId, tenant.userId, input) }),
    );
    return result.body;
  }

  @Patch('assets/upload-sessions/:id')
  async appendChunk(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') sessionId: string,
    @Body() body: unknown,
  ): Promise<{ receivedBytes: number }> {
    const input = uploadChunkSchema.parse(body);
    return this.assets.appendChunk(tenant.tenantId, sessionId, input.offsetBytes, Buffer.from(input.chunkBase64, 'base64'));
  }

  @Post('assets/upload-sessions/:id/complete')
  async completeResumable(@CurrentTenant() tenant: TenantContext, @Param('id') sessionId: string): Promise<AssetSummary> {
    return this.assets.completeResumableUpload(tenant.tenantId, sessionId, tenant.userId);
  }

  @Post('assets/:id/complete')
  async completePresigned(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<AssetSummary> {
    const input = completePresignedUploadSchema.parse(body);
    return this.assets.completePresignedUpload(tenant.tenantId, id, tenant.userId, input.clientMetadata);
  }

  @Get('assets')
  async list(@CurrentTenant() tenant: TenantContext, @Query() query: unknown) {
    const input = listAssetsQuerySchema.parse(query);
    return this.assets.listAssets(tenant.tenantId, input);
  }

  @Get('assets/:id')
  async getOne(@CurrentTenant() tenant: TenantContext, @Param('id') id: string): Promise<{ asset: AssetSummary; versions: AssetVersionSummary[] }> {
    return this.assets.getAsset(tenant.tenantId, id);
  }

  @Patch('assets/:id')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('update', 'Asset'))
  async update(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() body: unknown): Promise<AssetSummary> {
    const input = updateAssetSchema.parse(body);
    return this.assets.updateAsset(tenant.tenantId, id, tenant.userId, input);
  }

  @Delete('assets/:id')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('delete', 'Asset'))
  async remove(@CurrentTenant() tenant: TenantContext, @Param('id') id: string): Promise<{ deleted: true }> {
    await this.assets.deleteAsset(tenant.tenantId, id, tenant.userId);
    return { deleted: true };
  }

  @Post('assets/:id/rollback')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('update', 'Asset'))
  async rollback(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() body: unknown): Promise<AssetSummary> {
    const input = rollbackAssetSchema.parse(body);
    return this.assets.rollbackAsset(tenant.tenantId, id, tenant.userId, input);
  }

  @Post('assets/:id/preflight')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('read', 'Asset'))
  async runPreflight(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() body: unknown): Promise<PreflightReportResult> {
    const input = runPreflightSchema.parse(body);
    return this.assets.runPreflight(tenant.tenantId, id, input);
  }

  @Post('folders')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('create', 'Asset'))
  async createFolder(@CurrentTenant() tenant: TenantContext, @Body() body: unknown): Promise<FolderSummary> {
    const input = createFolderSchema.parse(body);
    return this.assets.createFolder(tenant.tenantId, input.name, input.parentId ?? null);
  }

  @Get('folders')
  async listFolders(@CurrentTenant() tenant: TenantContext): Promise<FolderSummary[]> {
    return this.assets.listFolders(tenant.tenantId);
  }

  @Post('collections')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('create', 'Collection'))
  async createCollection(@CurrentTenant() tenant: TenantContext, @Body() body: unknown): Promise<CollectionSummary> {
    const input = createCollectionSchema.parse(body);
    return this.assets.createCollection(tenant.tenantId, input.name, input.description);
  }

  @Get('collections')
  async listCollections(@CurrentTenant() tenant: TenantContext): Promise<CollectionSummary[]> {
    return this.assets.listCollections(tenant.tenantId);
  }

  @Post('collections/:id/assets')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('update', 'Collection'))
  async addToCollection(@CurrentTenant() tenant: TenantContext, @Param('id') collectionId: string, @Body() body: unknown): Promise<{ added: true }> {
    const input = addAssetToCollectionSchema.parse(body);
    await this.assets.addAssetToCollection(tenant.tenantId, collectionId, input.assetId);
    return { added: true };
  }

  @Delete('collections/:id/assets/:assetId')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('update', 'Collection'))
  async removeFromCollection(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') collectionId: string,
    @Param('assetId') assetId: string,
  ): Promise<{ removed: true }> {
    await this.assets.removeAssetFromCollection(tenant.tenantId, collectionId, assetId);
    return { removed: true };
  }
}
