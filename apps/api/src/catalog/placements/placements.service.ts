import { NotFoundException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { PlacementItem, PlacementSummary, PlacementTemplateSummary, UpsertPlacementInput } from '@omnisell/shared';
import { DesignPlacementRepository } from '../../repositories/design-placement.repository';
import { ProductRepository } from '../../repositories/product.repository';
import { AuditLogService } from '../../audit/audit-log.service';

/** Design->placement mapping + reusable templates (featureslist.md 3.4/3.5,
 * implentationplanphase.md task 2.8). */
@Injectable()
export class PlacementsService {
  constructor(
    private readonly placements: DesignPlacementRepository,
    private readonly products: ProductRepository,
    private readonly audit: AuditLogService,
  ) {}

  async upsertPlacement(tenantId: string, userId: string, productId: string, input: UpsertPlacementInput): Promise<PlacementSummary> {
    const product = await this.products.findById(tenantId, productId);
    if (product === null) {
      throw new NotFoundException('Product not found');
    }
    const placement = await this.placements.upsert({
      tenantId,
      productId,
      placementCode: input.placementCode,
      assetId: input.assetId,
      xPct: input.xPct,
      yPct: input.yPct,
      scalePct: input.scalePct,
      rotationDeg: input.rotationDeg,
    });
    await this.audit.record({
      tenantId,
      actorId: userId,
      action: 'placement.upserted',
      entityType: 'DesignPlacement',
      entityId: placement.id,
      after: placement,
    });
    return toSummary(placement);
  }

  async listForProduct(tenantId: string, productId: string): Promise<PlacementSummary[]> {
    const rows = await this.placements.listForProduct(tenantId, productId);
    return rows.map(toSummary);
  }

  async removePlacement(tenantId: string, userId: string, productId: string, placementCode: string): Promise<void> {
    await this.placements.remove(tenantId, productId, placementCode);
    await this.audit.record({ tenantId, actorId: userId, action: 'placement.removed', entityType: 'DesignPlacement', entityId: `${productId}:${placementCode}` });
  }

  async saveTemplate(tenantId: string, userId: string, productId: string, name: string, blueprintId?: string): Promise<PlacementTemplateSummary> {
    const rows = await this.placements.listForProduct(tenantId, productId);
    const items: PlacementItem[] = rows.map((r) => ({
      placementCode: r.placementCode,
      xPct: r.xPct,
      yPct: r.yPct,
      scalePct: r.scalePct,
      rotationDeg: r.rotationDeg,
    }));
    const template = await this.placements.createTemplate({
      tenantId,
      name,
      blueprintId: blueprintId ?? null,
      items: items as unknown as Prisma.InputJsonValue,
    });
    await this.audit.record({ tenantId, actorId: userId, action: 'placement_template.created', entityType: 'PlacementTemplate', entityId: template.id, after: { itemCount: items.length } });
    return {
      id: template.id,
      name: template.name,
      blueprintId: template.blueprintId,
      items: template.items as unknown as PlacementItem[],
      createdAt: template.createdAt.toISOString(),
    };
  }

  async listTemplates(tenantId: string): Promise<PlacementTemplateSummary[]> {
    const rows = await this.placements.listTemplates(tenantId);
    return rows.map((t) => ({
      id: t.id,
      name: t.name,
      blueprintId: t.blueprintId,
      items: t.items as unknown as PlacementItem[],
      createdAt: t.createdAt.toISOString(),
    }));
  }

  /** Applies a saved template's geometry to a product, mapping every
   * placement it defines onto the given asset (2.8/3.5 — "saved as a
   * reusable template"). */
  async applyTemplate(tenantId: string, userId: string, productId: string, templateId: string, assetId: string): Promise<PlacementSummary[]> {
    const product = await this.products.findById(tenantId, productId);
    const template = await this.placements.findTemplateById(tenantId, templateId);
    if (product === null || template === null) {
      throw new NotFoundException('Product or template not found');
    }
    const items = template.items as unknown as PlacementItem[];
    const results: PlacementSummary[] = [];
    for (const item of items) {
      const placement = await this.placements.upsert({
        tenantId,
        productId,
        placementCode: item.placementCode,
        assetId,
        xPct: item.xPct,
        yPct: item.yPct,
        scalePct: item.scalePct,
        rotationDeg: item.rotationDeg,
        templateId,
      });
      results.push(toSummary(placement));
    }
    await this.audit.record({ tenantId, actorId: userId, action: 'placement_template.applied', entityType: 'Product', entityId: productId, after: { templateId, assetId } });
    return results;
  }
}

function toSummary(placement: {
  id: string;
  productId: string;
  assetId: string;
  templateId: string | null;
  placementCode: string;
  xPct: number;
  yPct: number;
  scalePct: number;
  rotationDeg: number;
}): PlacementSummary {
  return {
    id: placement.id,
    productId: placement.productId,
    assetId: placement.assetId,
    templateId: placement.templateId,
    placementCode: placement.placementCode,
    xPct: placement.xPct,
    yPct: placement.yPct,
    scalePct: placement.scalePct,
    rotationDeg: placement.rotationDeg,
  };
}
