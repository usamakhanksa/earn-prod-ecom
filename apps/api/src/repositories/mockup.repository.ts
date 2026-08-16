import { Injectable } from '@nestjs/common';
import type { MockupRender, MockupTemplate } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantScopedRepository } from './tenant-scoped.repository';

/** Mockup templates + renders (featureslist.md 2.9) — one repository, since
 * a render is meaningless without its template. */
@Injectable()
export class MockupRepository extends TenantScopedRepository<Pick<PrismaService, 'mockupTemplate'>> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  override get delegate() {
    return this.prisma;
  }

  async listTemplates(tenantId: string): Promise<MockupTemplate[]> {
    return this.prisma.mockupTemplate.findMany({ where: { tenantId }, orderBy: { name: 'asc' } });
  }

  async findTemplateById(tenantId: string, id: string): Promise<MockupTemplate | null> {
    return this.prisma.mockupTemplate.findFirst({ where: { id, tenantId } });
  }

  async createTemplate(input: {
    tenantId: string;
    blueprintId?: string | null;
    placementCode: string;
    name: string;
    sceneKey: string;
    sceneWidthPx: number;
    sceneHeightPx: number;
    printAreaX: number;
    printAreaY: number;
    printAreaWidth: number;
    printAreaHeight: number;
    rotationDeg?: number;
    colorway?: string | null;
  }): Promise<MockupTemplate> {
    return this.prisma.mockupTemplate.create({
      data: {
        tenantId: input.tenantId,
        blueprintId: input.blueprintId ?? null,
        placementCode: input.placementCode,
        name: input.name,
        sceneKey: input.sceneKey,
        sceneWidthPx: input.sceneWidthPx,
        sceneHeightPx: input.sceneHeightPx,
        printAreaX: input.printAreaX,
        printAreaY: input.printAreaY,
        printAreaWidth: input.printAreaWidth,
        printAreaHeight: input.printAreaHeight,
        rotationDeg: input.rotationDeg ?? 0,
        colorway: input.colorway ?? null,
      },
    });
  }

  async createRender(tenantId: string, templateId: string, assetId: string): Promise<MockupRender> {
    return this.prisma.mockupRender.create({ data: { tenantId, templateId, assetId, status: 'PROCESSING' } });
  }

  async completeRender(tenantId: string, id: string, outputKey: string): Promise<MockupRender | null> {
    const existing = await this.prisma.mockupRender.findFirst({ where: { id, tenantId } });
    if (existing === null) {
      return null;
    }
    return this.prisma.mockupRender.update({
      where: { id },
      data: { status: 'READY', outputKey, completedAt: new Date() },
    });
  }

  async failRender(tenantId: string, id: string, errorMessage: string): Promise<MockupRender | null> {
    const existing = await this.prisma.mockupRender.findFirst({ where: { id, tenantId } });
    if (existing === null) {
      return null;
    }
    return this.prisma.mockupRender.update({
      where: { id },
      data: { status: 'FAILED', errorMessage, completedAt: new Date() },
    });
  }

  async listRendersForAsset(tenantId: string, assetId: string): Promise<MockupRender[]> {
    return this.prisma.mockupRender.findMany({ where: { tenantId, assetId }, orderBy: { createdAt: 'desc' } });
  }
}
