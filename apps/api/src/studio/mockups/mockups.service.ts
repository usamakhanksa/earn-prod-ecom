import { Injectable, NotFoundException } from '@nestjs/common';
import type { MockupRenderSummary, MockupTemplateSummary } from '@omnisell/shared';
import { MockupRepository } from '../../repositories/mockup.repository';
import { AssetRepository } from '../../repositories/asset.repository';
import { ObjectStorageService } from '../../common/storage/object-storage.service';
import { MockupComposeService } from './mockup-compose.service';
import { AuditLogService } from '../../audit/audit-log.service';

/**
 * Mockup generator (featureslist.md 2.9). Real synchronous compositing —
 * `MockupComposeService.compose()` genuinely runs against real bytes (see its
 * unit tests). The gap in THIS environment is fetching those bytes from
 * object storage at all: `ObjectStorageService` has no live MinIO to talk to
 * here (docs/DEBT.md), so `compose()` below will surface an honest 503 rather
 * than fabricate a rendered image — the render row is still recorded as
 * FAILED with that reason, which is what a real outage would also produce.
 */
@Injectable()
export class MockupsService {
  constructor(
    private readonly mockups: MockupRepository,
    private readonly assets: AssetRepository,
    private readonly objectStorage: ObjectStorageService,
    private readonly composer: MockupComposeService,
    private readonly audit: AuditLogService,
  ) {}

  async listTemplates(tenantId: string): Promise<MockupTemplateSummary[]> {
    const templates = await this.mockups.listTemplates(tenantId);
    return templates.map(toTemplateSummary);
  }

  async compose(tenantId: string, userId: string, templateId: string, assetId: string): Promise<MockupRenderSummary> {
    const template = await this.mockups.findTemplateById(tenantId, templateId);
    const asset = await this.assets.findById(tenantId, assetId);
    if (template === null || asset === null) {
      throw new NotFoundException('Mockup template or asset not found');
    }

    const render = await this.mockups.createRender(tenantId, templateId, assetId);

    try {
      const [sceneBuffer, designBuffer] = await Promise.all([
        this.objectStorage.getObject(template.sceneKey),
        this.objectStorage.getObject(asset.storageKey),
      ]);
      const composited = await this.composer.compose({
        sceneBuffer,
        designBuffer,
        printAreaX: template.printAreaX,
        printAreaY: template.printAreaY,
        printAreaWidth: template.printAreaWidth,
        printAreaHeight: template.printAreaHeight,
        rotationDeg: template.rotationDeg,
      });

      const outputKey = `tenants/${tenantId}/mockups/${render.id}.png`;
      await this.objectStorage.putObject(outputKey, composited, 'image/png');

      const completed = await this.mockups.completeRender(tenantId, render.id, outputKey);
      if (completed === null) {
        throw new NotFoundException('Mockup render not found');
      }
      await this.audit.record({ tenantId, actorId: userId, action: 'mockup.rendered', entityType: 'MockupRender', entityId: render.id });
      return toRenderSummary(completed);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.mockups.failRender(tenantId, render.id, message);
      await this.audit.record({
        tenantId,
        actorId: userId,
        action: 'mockup.render_failed',
        entityType: 'MockupRender',
        entityId: render.id,
        after: { error: message },
      });
      throw error; // surface the real error (e.g. 503 object_storage_unreachable) — the FAILED row above still records it
    }
  }

  async listRendersForAsset(tenantId: string, assetId: string): Promise<MockupRenderSummary[]> {
    const rows = await this.mockups.listRendersForAsset(tenantId, assetId);
    return rows.map(toRenderSummary);
  }
}

function toTemplateSummary(template: {
  id: string;
  blueprintId: string | null;
  placementCode: string;
  name: string;
  sceneKey: string;
  sceneWidthPx: number;
  sceneHeightPx: number;
  printAreaX: number;
  printAreaY: number;
  printAreaWidth: number;
  printAreaHeight: number;
  rotationDeg: number;
  colorway: string | null;
}): MockupTemplateSummary {
  return { ...template };
}

function toRenderSummary(render: {
  id: string;
  templateId: string;
  assetId: string;
  outputKey: string | null;
  status: string;
  errorMessage: string | null;
  createdAt: Date;
  completedAt: Date | null;
}): MockupRenderSummary {
  return {
    id: render.id,
    templateId: render.templateId,
    assetId: render.assetId,
    outputKey: render.outputKey,
    status: render.status,
    errorMessage: render.errorMessage,
    createdAt: render.createdAt.toISOString(),
    completedAt: render.completedAt?.toISOString() ?? null,
  };
}
