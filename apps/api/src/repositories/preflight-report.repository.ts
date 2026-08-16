import { Injectable } from '@nestjs/common';
import type { PreflightReport, Prisma } from '@prisma/client';
import type { PreflightReportResult } from '@omnisell/shared';
import { PrismaService } from '../prisma/prisma.service';
import { TenantScopedRepository } from './tenant-scoped.repository';

@Injectable()
export class PreflightReportRepository extends TenantScopedRepository<Pick<PrismaService, 'preflightReport'>> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  override get delegate() {
    return this.prisma;
  }

  async create(
    tenantId: string,
    assetId: string,
    result: PreflightReportResult,
    blueprintId?: string,
    placementCode?: string,
  ): Promise<PreflightReport> {
    return this.prisma.preflightReport.create({
      data: {
        tenantId,
        assetId,
        blueprintId: blueprintId ?? null,
        placementCode: placementCode ?? null,
        overallStatus: result.overallStatus,
        rules: result.rules as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async listForAsset(tenantId: string, assetId: string): Promise<PreflightReport[]> {
    return this.prisma.preflightReport.findMany({ where: { tenantId, assetId }, orderBy: { createdAt: 'desc' } });
  }

  async latestForAsset(tenantId: string, assetId: string): Promise<PreflightReport | null> {
    return this.prisma.preflightReport.findFirst({ where: { tenantId, assetId }, orderBy: { createdAt: 'desc' } });
  }

  /** Bulk latest-status lookup for the asset-library list view (one query
   * instead of N+1 per rendered row). */
  async latestStatusByAssetIds(tenantId: string, assetIds: string[]): Promise<Map<string, string>> {
    if (assetIds.length === 0) {
      return new Map();
    }
    const reports = await this.prisma.preflightReport.findMany({
      where: { tenantId, assetId: { in: assetIds } },
      orderBy: { createdAt: 'desc' },
      select: { assetId: true, overallStatus: true },
    });
    const byAsset = new Map<string, string>();
    for (const report of reports) {
      if (!byAsset.has(report.assetId)) {
        byAsset.set(report.assetId, report.overallStatus);
      }
    }
    return byAsset;
  }
}
