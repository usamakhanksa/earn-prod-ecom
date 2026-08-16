import { Injectable } from '@nestjs/common';
import type { DesignPlacement, PlacementTemplate, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantScopedRepository } from './tenant-scoped.repository';

/** Design->placement mapping (featureslist.md 3.4/3.5) + its reusable
 * templates — one repository, since a template only exists to seed
 * placements. */
@Injectable()
export class DesignPlacementRepository extends TenantScopedRepository<Pick<PrismaService, 'designPlacement'>> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  override get delegate() {
    return this.prisma;
  }

  async upsert(input: {
    tenantId: string;
    productId: string;
    placementCode: string;
    assetId: string;
    xPct: number;
    yPct: number;
    scalePct: number;
    rotationDeg: number;
    templateId?: string | null;
  }): Promise<DesignPlacement> {
    return this.prisma.designPlacement.upsert({
      where: { productId_placementCode: { productId: input.productId, placementCode: input.placementCode } },
      update: {
        assetId: input.assetId,
        xPct: input.xPct,
        yPct: input.yPct,
        scalePct: input.scalePct,
        rotationDeg: input.rotationDeg,
        templateId: input.templateId ?? null,
      },
      create: {
        tenantId: input.tenantId,
        productId: input.productId,
        placementCode: input.placementCode,
        assetId: input.assetId,
        xPct: input.xPct,
        yPct: input.yPct,
        scalePct: input.scalePct,
        rotationDeg: input.rotationDeg,
        templateId: input.templateId ?? null,
      },
    });
  }

  async listForProduct(tenantId: string, productId: string): Promise<DesignPlacement[]> {
    return this.prisma.designPlacement.findMany({ where: { tenantId, productId }, orderBy: { placementCode: 'asc' } });
  }

  async remove(tenantId: string, productId: string, placementCode: string): Promise<void> {
    await this.prisma.designPlacement.deleteMany({ where: { tenantId, productId, placementCode } });
  }

  async createTemplate(input: {
    tenantId: string;
    name: string;
    blueprintId?: string | null;
    items: Prisma.InputJsonValue;
  }): Promise<PlacementTemplate> {
    return this.prisma.placementTemplate.create({
      data: { tenantId: input.tenantId, name: input.name, blueprintId: input.blueprintId ?? null, items: input.items },
    });
  }

  async listTemplates(tenantId: string): Promise<PlacementTemplate[]> {
    return this.prisma.placementTemplate.findMany({ where: { tenantId }, orderBy: { name: 'asc' } });
  }

  async findTemplateById(tenantId: string, id: string): Promise<PlacementTemplate | null> {
    return this.prisma.placementTemplate.findFirst({ where: { id, tenantId } });
  }
}
