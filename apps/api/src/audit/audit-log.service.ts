import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditLogEntry {
  tenantId?: string | null;
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ipAddress?: string | null;
}

/**
 * Generic audit-log writer (prompt.md Phase 1.10 / docs/DEBT.md 1-D5).
 *
 * `AuthService` already writes precise, hand-crafted rows for its three most
 * security-sensitive events (user.register, session.reuse_detected,
 * user.password_reset) directly via `prisma.auditLog.create` — those call sites
 * are intentionally left as-is (see `AuthController`'s `@SkipAuditLog()` usage)
 * because a generic interceptor cannot know, for example, that a login mutates a
 * Session row but the *meaningful* audit subject is the reuse-detection outcome,
 * not "POST /auth/refresh succeeded". New feature services in this pass (MFA,
 * Invite, FeatureFlag) call this service directly for the same reason: they know
 * their own domain semantics and can supply a real `before`/`after` diff. The
 * global `AuditLogInterceptor` is the catch-all safety net for everything else —
 * it cannot supply a real `before`, only a redacted response snapshot as `after`.
 */
@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditLogEntry): Promise<void> {
    try {
      const before = toJsonInput(entry.before);
      const after = toJsonInput(entry.after);
      await this.prisma.auditLog.create({
        data: {
          tenantId: entry.tenantId ?? null,
          actorId: entry.actorId ?? null,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId ?? null,
          // exactOptionalPropertyTypes: Prisma's JSON input type has no `undefined`
          // member, so an absent before/after must be an omitted key, not `undefined`.
          ...(before !== undefined ? { before } : {}),
          ...(after !== undefined ? { after } : {}),
          ipAddress: entry.ipAddress ?? null,
        },
      });
    } catch (error) {
      // Audit logging must never take down the mutation it is describing.
      this.logger.error(`Failed to write audit log entry (${entry.action}): ${String(error)}`);
    }
  }
}

function toJsonInput(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }
  // JSON round-trip drops undefined/function/symbol values and Date instances
  // become ISO strings — exactly what a JSON column can store.
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
