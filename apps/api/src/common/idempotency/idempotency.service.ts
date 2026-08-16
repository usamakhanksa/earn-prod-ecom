import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface IdempotentRun<T> {
  status: number;
  body: T;
}

/**
 * Generic `Idempotency-Key` support (prompt.md constraint #5) for routes that have
 * no natural DB-level unique constraint to lean on (unlike, say,
 * `ProductPurchaseWithPoints.idempotencyKey`). A replayed key with an identical
 * request body returns the original response verbatim; a replayed key with a
 * *different* body is rejected — the key is a promise about one specific request,
 * not a free pass to overwrite it with something else.
 *
 * `ownerId` must never be empty — it scopes the uniqueness constraint (tenantId,
 * userId, or the literal "global") and Postgres treats NULL as distinct from NULL,
 * which would silently defeat a nullable-column unique index.
 */
@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);

  constructor(private readonly prisma: PrismaService) {}

  async run<T>(
    params: { scope: string; key: string | undefined; ownerId: string; requestBody: unknown; ttlHours?: number },
    fn: () => Promise<IdempotentRun<T>>,
  ): Promise<IdempotentRun<T> & { replayed: boolean }> {
    if (params.key === undefined || params.key.length === 0) {
      const result = await fn();
      return { ...result, replayed: false };
    }

    const requestHash = hashRequestBody(params.requestBody);
    const existing = await this.prisma.idempotencyRecord.findUnique({
      where: { scope_key_ownerId: { scope: params.scope, key: params.key, ownerId: params.ownerId } },
    });

    if (existing !== null) {
      if (existing.requestHash !== requestHash) {
        throw new ConflictException(
          'Idempotency-Key was already used with a different request payload',
        );
      }
      return { status: existing.statusCode, body: existing.responseJson as T, replayed: true };
    }

    const result = await fn();
    try {
      await this.prisma.idempotencyRecord.create({
        data: {
          scope: params.scope,
          key: params.key,
          ownerId: params.ownerId,
          requestHash,
          responseJson: result.body as Prisma.InputJsonValue,
          statusCode: result.status,
          expiresAt: addHours(new Date(), params.ttlHours ?? 24),
        },
      });
    } catch (error) {
      // A concurrent duplicate request racing us to insert the same key is not a
      // failure of this request — it already computed and is about to return the
      // (equivalent) result below. Anything else is logged but still non-fatal:
      // idempotency is a best-effort safety net, not the source of truth.
      this.logger.debug(`Idempotency record persist skipped (${params.scope}/${params.key}): ${String(error)}`);
    }
    return { ...result, replayed: false };
  }
}

function hashRequestBody(body: unknown): string {
  return createHash('sha256').update(JSON.stringify(body ?? null)).digest('hex');
}

function addHours(date: Date, hours: number): Date {
  const result = new Date(date);
  result.setUTCHours(result.getUTCHours() + hours);
  return result;
}
