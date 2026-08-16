import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Tenant-scoped repository base (prompt.md constraint #4).
 *
 * Every query a repository exposes forces `tenantId` into the WHERE clause from the
 * caller's request context — controllers can never pass a raw Prisma delegate. RLS is
 * the second line of defence (infra/db/rls.sql). The cross-tenant negative test proves
 * reads fail outside the caller's tenant.
 *
 * Generic over the Prisma delegate so a repository can be typed per model while the
 * tenant-injection behaviour stays in one place.
 */
export abstract class TenantScopedRepository<TDelegate> {
  protected constructor(protected readonly prisma: PrismaService) {}

  abstract get delegate(): TDelegate;

  protected whereTenant(args: { where?: Record<string, unknown> }, tenantId: string): { where: Record<string, unknown> } {
    return {
      where: { ...(args.where ?? {}), tenantId },
    };
  }

  /**
   * Public by design: this is the cross-tenant negative test's entry point (Phase 1
   * gate — see test/integration/rls-isolation.integration-spec.ts). Concrete repository
   * methods use it internally too; it is not meant as a general escape hatch for
   * controllers, which must go through a repository's tenant-scoped query methods.
   */
  async withTenantContext<T>(
    tenantId: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    // Transaction-scoped RLS session variable: keeps row-level security effective even
    // on a pooled connection (set_config within the txn, reset on commit).
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      await tx.$executeRaw`SELECT set_config('app.user_id', ${this.callerUserId ?? ''}, true)`;
      return fn(tx);
    });
  }

  // Public for the same reason as withTenantContext above — tests set this directly
  // to simulate the authenticated caller without going through a full request.
  set callerUserId(value: string | null) {
    this._callerUserId = value;
  }
  get callerUserId(): string | null {
    return this._callerUserId;
  }
  private _callerUserId: string | null = null;
}