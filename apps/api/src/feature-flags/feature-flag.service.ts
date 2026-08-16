import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { FeatureFlagSummary } from '@omnisell/shared';
import { PrismaService } from '../prisma/prisma.service';
import { FeatureFlagTargetRepository } from '../repositories/feature-flag-target.repository';
import { AuditLogService } from '../audit/audit-log.service';

export interface CreateFlagInput {
  key: string;
  description?: string | undefined;
  isEnabled: boolean;
  rolloutPct?: number | undefined;
}

export interface UpdateFlagInput {
  description?: string | undefined;
  isEnabled?: boolean | undefined;
  rolloutPct?: number | null | undefined;
}

/**
 * Feature-flag service (prompt.md Phase 1.11 / docs/DEBT.md 1-D6).
 *
 * `FeatureFlag` definitions are global platform config (no tenantId) — creating
 * or editing one is a platform-admin action (`AdminOnlyGuard`). Per-tenant
 * targeting (`FeatureFlagTarget`) is tenant-scoped and can be set either by a
 * platform admin (any tenant) or by that tenant's own OWNER/ADMIN (their tenant
 * only) — CASL already grants `manage` on all subjects to those two roles.
 * Percentage rollout is a deterministic hash bucket per (tenantId, key) so the
 * same tenant always lands on the same side of the rollout — no per-request
 * randomness that would flip a feature on and off between calls.
 */
@Injectable()
export class FeatureFlagService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly targets: FeatureFlagTargetRepository,
    private readonly audit: AuditLogService,
  ) {}

  async create(input: CreateFlagInput, actorId: string): Promise<FeatureFlagSummary> {
    const existing = await this.prisma.featureFlag.findUnique({ where: { key: input.key } });
    if (existing !== null) {
      throw new ConflictException(`Feature flag '${input.key}' already exists`);
    }
    const flag = await this.prisma.featureFlag.create({
      data: {
        key: input.key,
        description: input.description ?? null,
        isEnabled: input.isEnabled,
        rolloutPct: input.rolloutPct ?? null,
      },
    });
    await this.audit.record({
      actorId,
      action: 'feature_flag.created',
      entityType: 'FeatureFlag',
      entityId: flag.id,
      after: flag,
    });
    return this.toSummary(flag, null);
  }

  async update(key: string, input: UpdateFlagInput, actorId: string): Promise<FeatureFlagSummary> {
    const before = await this.prisma.featureFlag.findUnique({ where: { key } });
    if (before === null) {
      throw new NotFoundException(`Feature flag '${key}' not found`);
    }
    const after = await this.prisma.featureFlag.update({
      where: { key },
      data: {
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.isEnabled !== undefined ? { isEnabled: input.isEnabled } : {}),
        ...(input.rolloutPct !== undefined ? { rolloutPct: input.rolloutPct } : {}),
      },
    });
    await this.audit.record({
      actorId,
      action: 'feature_flag.updated',
      entityType: 'FeatureFlag',
      entityId: after.id,
      before,
      after,
    });
    return this.toSummary(after, null);
  }

  /** Platform-admin read: every flag definition, global (no tenant lens) —
   * backs the `/admin` Feature Flags & Config screen (featureslist.md §0.2). */
  async listAllDefinitions() {
    return this.prisma.featureFlag.findMany({ orderBy: { key: 'asc' } });
  }

  /**
   * Phase 6 addition (task 6.8 — gating `zatca_einvoicing`): a single
   * flag's resolved boolean for one tenant, without fetching the whole
   * effective list. A missing flag DEFINITION (never created by a platform
   * admin) resolves to `false` — the safe, honest default for a flag nobody
   * has explicitly turned on, not an error.
   */
  async isEnabledForTenant(tenantId: string, key: string): Promise<boolean> {
    const flag = await this.prisma.featureFlag.findUnique({ where: { key } });
    if (flag === null) {
      return false;
    }
    const target = await this.targets.findOne(tenantId, flag.id);
    return this.toSummary(flag, target, tenantId).enabled;
  }

  /** Tenant-scoped read: every flag, resolved to what THIS tenant currently sees. */
  async listEffectiveForTenant(tenantId: string): Promise<FeatureFlagSummary[]> {
    const [flags, targets] = await Promise.all([
      this.prisma.featureFlag.findMany({ orderBy: { key: 'asc' } }),
      this.targets.listForTenant(tenantId),
    ]);
    const targetByFlagId = new Map(targets.map((target) => [target.flagId, target]));
    return flags.map((flag) => this.toSummary(flag, targetByFlagId.get(flag.id) ?? null, tenantId));
  }

  async setTarget(
    key: string,
    targetTenantId: string,
    isEnabled: boolean,
    actor: { userId: string; tenantId: string; isPlatformAdmin: boolean },
  ): Promise<void> {
    this.assertCanTarget(targetTenantId, actor);
    const flag = await this.prisma.featureFlag.findUnique({ where: { key } });
    if (flag === null) {
      throw new NotFoundException(`Feature flag '${key}' not found`);
    }
    const before = await this.targets.findOne(targetTenantId, flag.id);
    const after = await this.targets.upsert(targetTenantId, flag.id, isEnabled);
    await this.audit.record({
      tenantId: targetTenantId,
      actorId: actor.userId,
      action: 'feature_flag_target.set',
      entityType: 'FeatureFlagTarget',
      entityId: after.id,
      before,
      after,
    });
  }

  async removeTarget(
    key: string,
    targetTenantId: string,
    actor: { userId: string; tenantId: string; isPlatformAdmin: boolean },
  ): Promise<void> {
    this.assertCanTarget(targetTenantId, actor);
    const flag = await this.prisma.featureFlag.findUnique({ where: { key } });
    if (flag === null) {
      throw new NotFoundException(`Feature flag '${key}' not found`);
    }
    const before = await this.targets.findOne(targetTenantId, flag.id);
    await this.targets.remove(targetTenantId, flag.id);
    await this.audit.record({
      tenantId: targetTenantId,
      actorId: actor.userId,
      action: 'feature_flag_target.removed',
      entityType: 'FeatureFlagTarget',
      entityId: before?.id ?? flag.id,
      before,
    });
  }

  private assertCanTarget(targetTenantId: string, actor: { tenantId: string; isPlatformAdmin: boolean }): void {
    if (!actor.isPlatformAdmin && targetTenantId !== actor.tenantId) {
      throw new ForbiddenException('You can only target feature flags for your own tenant');
    }
  }

  private toSummary(
    flag: { id: string; key: string; description: string | null; isEnabled: boolean; rolloutPct: number | null },
    target: { isEnabled: boolean } | null,
    tenantId?: string,
  ): FeatureFlagSummary {
    if (target !== null) {
      return { key: flag.key, description: flag.description, enabled: target.isEnabled, source: 'target' };
    }
    if (flag.rolloutPct !== null && tenantId !== undefined) {
      const enabled = bucketOf(tenantId, flag.key) < flag.rolloutPct;
      return { key: flag.key, description: flag.description, enabled, source: 'rollout' };
    }
    return { key: flag.key, description: flag.description, enabled: flag.isEnabled, source: 'default' };
  }
}

/** Deterministic 0-99 bucket for (tenantId, key) — same inputs always land in the
 * same bucket, so a rollout percentage never flickers for a given tenant. */
function bucketOf(tenantId: string, key: string): number {
  const digest = createHash('sha1').update(`${tenantId}:${key}`).digest();
  return digest.readUInt32BE(0) % 100;
}
