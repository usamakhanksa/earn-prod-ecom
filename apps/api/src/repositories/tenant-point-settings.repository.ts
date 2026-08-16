import { Injectable } from '@nestjs/common';
import type { TenantPointSettings } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantScopedRepository } from './tenant-scoped.repository';

/** `TenantPointSettings` (§6.2) — the per-tenant redemption rate/floor/share-cap
 * config; env vars must never carry this (§12). */
@Injectable()
export class TenantPointSettingsRepository extends TenantScopedRepository<Pick<PrismaService, 'tenantPointSettings'>> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  override get delegate() {
    return this.prisma;
  }

  async find(tenantId: string): Promise<TenantPointSettings | null> {
    return this.prisma.tenantPointSettings.findUnique({ where: { tenantId } });
  }

  /** Every tenant gets a settings row lazily, with the same defaults the
   * schema declares — never a silent "assume defaults with no row". */
  async findOrCreateDefault(tenantId: string): Promise<TenantPointSettings> {
    const existing = await this.find(tenantId);
    if (existing !== null) {
      return existing;
    }
    return this.prisma.tenantPointSettings.create({ data: { tenantId } });
  }

  async update(
    tenantId: string,
    patch: {
      currencyCode?: string | undefined;
      pointsPerCurrencyMinor?: number | undefined;
      minRedeemPoints?: number | undefined;
      maxRedeemSharePct?: number | undefined;
      autoExpireDays?: number | null | undefined;
      expiryReminderDays?: number | undefined;
      redemptionEnabled?: boolean | undefined;
    },
  ): Promise<TenantPointSettings> {
    await this.findOrCreateDefault(tenantId);
    return this.prisma.tenantPointSettings.update({
      where: { tenantId },
      data: {
        ...(patch.currencyCode !== undefined ? { currencyCode: patch.currencyCode } : {}),
        ...(patch.pointsPerCurrencyMinor !== undefined ? { pointsPerCurrencyMinor: patch.pointsPerCurrencyMinor } : {}),
        ...(patch.minRedeemPoints !== undefined ? { minRedeemPoints: patch.minRedeemPoints } : {}),
        ...(patch.maxRedeemSharePct !== undefined ? { maxRedeemSharePct: patch.maxRedeemSharePct } : {}),
        ...(patch.autoExpireDays !== undefined ? { autoExpireDays: patch.autoExpireDays } : {}),
        ...(patch.expiryReminderDays !== undefined ? { expiryReminderDays: patch.expiryReminderDays } : {}),
        ...(patch.redemptionEnabled !== undefined ? { redemptionEnabled: patch.redemptionEnabled } : {}),
      },
    });
  }
}
