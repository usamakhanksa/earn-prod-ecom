import { Injectable } from '@nestjs/common';
import type { FxRate } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * `FxRate` is a GLOBAL cache table (Phase 2, docs/DEBT.md 2-D9 — "an exchange
 * rate is a market fact, not tenant data"). No repository existed for it
 * before this phase since nothing wrote to it; Phase 6's `FxIngestionService`
 * is the first real writer (task 6.3).
 */
@Injectable()
export class FxRateRepository {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(baseCurrency: string, quoteCurrency: string, rate: number, asOf: Date, source: string): Promise<FxRate> {
    return this.prisma.fxRate.upsert({
      where: { baseCurrency_quoteCurrency_asOf: { baseCurrency, quoteCurrency, asOf } },
      create: { baseCurrency, quoteCurrency, rate, asOf, source },
      update: { rate, source },
    });
  }

  /** Latest known rate at or before `asOf` (defaults to now). Returns null if
   * nothing has ever been ingested for this pair — callers must handle that
   * honestly rather than assuming a rate of 1. */
  async findLatest(baseCurrency: string, quoteCurrency: string, asOf: Date = new Date()): Promise<FxRate | null> {
    if (baseCurrency === quoteCurrency) {
      return { id: 'identity', baseCurrency, quoteCurrency, rate: 1, asOf, source: 'identity', createdAt: asOf };
    }
    return this.prisma.fxRate.findFirst({
      where: { baseCurrency, quoteCurrency, asOf: { lte: asOf } },
      orderBy: { asOf: 'desc' },
    });
  }

  async findRateBookedAt(baseCurrency: string, quoteCurrency: string, bookedAt: Date): Promise<FxRate | null> {
    return this.findLatest(baseCurrency, quoteCurrency, bookedAt);
  }
}
