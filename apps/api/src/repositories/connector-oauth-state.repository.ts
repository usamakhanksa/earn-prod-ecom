import { Injectable } from '@nestjs/common';
import type { ConnectorOAuthState } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantScopedRepository } from './tenant-scoped.repository';

/** PKCE handshake state — state validation + single-use consumption
 * (implentationplanphase.md task 3.3). */
@Injectable()
export class ConnectorOAuthStateRepository extends TenantScopedRepository<Pick<PrismaService, 'connectorOAuthState'>> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  override get delegate() {
    return this.prisma;
  }

  async create(input: {
    tenantId: string;
    connectionId: string;
    connectorSlug: string;
    state: string;
    codeVerifier: string;
    redirectUri: string;
    expiresAt: Date;
  }): Promise<ConnectorOAuthState> {
    return this.prisma.connectorOAuthState.create({ data: input });
  }

  /** Finds and atomically consumes a state token — a replayed callback (same
   * `state` used twice) must fail, which is exactly what the `consumedAt IS
   * NULL` guard on the update enforces. */
  async consume(state: string): Promise<ConnectorOAuthState | null> {
    const row = await this.prisma.connectorOAuthState.findUnique({ where: { state } });
    if (row === null || row.consumedAt !== null || row.expiresAt.getTime() < Date.now()) {
      return null;
    }
    const updated = await this.prisma.connectorOAuthState.updateMany({
      where: { id: row.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    return updated.count === 1 ? row : null;
  }
}
