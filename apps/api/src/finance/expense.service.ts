import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Expense } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ExpenseRepository } from '../repositories/expense.repository';
import { S3PresignService, type PresignedUpload } from '../common/storage/s3-presign.service';
import { LedgerService } from '../points/ledger.service';

/**
 * Expense tracking with receipt upload + OCR (Phase 6, task 6.5). Reuses
 * Phase 2's `S3PresignService` for the receipt upload itself (same real
 * SigV4-signed PUT URL generation every other upload path in this codebase
 * uses, same unverified-live-round-trip caveat, docs/DEBT.md 2-D1).
 *
 * OCR: no OCR engine/service (Tesseract binary, cloud Vision API key, etc.)
 * is reachable/configured in this sandbox. `ocrStatus` stays the honest
 * `'UNAVAILABLE'` default — this service NEVER fabricates extracted text.
 * `requestOcr()` exists as a real, named seam (mirrors
 * `ProductsService.assertNoLiveDependencies`'s Phase 2 pattern) that a real
 * OCR integration slots into later without changing any call site.
 */
@Injectable()
export class ExpenseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly expenses: ExpenseRepository,
    private readonly presign: S3PresignService,
    private readonly ledger: LedgerService,
  ) {}

  async initReceiptUpload(tenantId: string, filename: string, mimeType: string): Promise<PresignedUpload> {
    const storageKey = this.presign.buildStorageKey(tenantId, filename, 'receipts');
    return this.presign.presignPut(storageKey, mimeType);
  }

  async create(tenantId: string, actorId: string, input: { category: string; vendor?: string; description?: string; amountMinor: bigint; currency: string; incurredAt: Date; receiptStorageKey?: string; receiptMimeType?: string }): Promise<Expense> {
    return this.expenses.create({
      tenantId,
      createdById: actorId,
      category: input.category,
      vendor: input.vendor ?? null,
      description: input.description ?? null,
      amountMinor: input.amountMinor,
      currency: input.currency,
      incurredAt: input.incurredAt,
      receiptStorageKey: input.receiptStorageKey ?? null,
      receiptMimeType: input.receiptMimeType ?? null,
      ocrStatus: 'UNAVAILABLE',
    });
  }

  async list(tenantId: string, filters: { status?: string; category?: string }, cursor: string | undefined, limit: number) {
    return this.expenses.list(tenantId, filters, cursor, limit);
  }

  async findById(tenantId: string, id: string): Promise<Expense> {
    const expense = await this.expenses.findById(tenantId, id);
    if (expense === null) {
      throw new NotFoundException({ message: 'Expense not found', code: 'EXPENSE_NOT_FOUND' });
    }
    return expense;
  }

  /**
   * Approve/reject (task 6.5). Approving posts a real balanced ledger entry
   * (debit operating_expenses, credit cash — this service always books an
   * approved expense as immediately paid; a real accounts-payable/bill-pay
   * workflow with a separate "paid later" step is out of this phase's scope,
   * documented in docs/DEBT.md).
   */
  async decide(tenantId: string, id: string, decision: 'APPROVED' | 'REJECTED', actorId: string): Promise<Expense> {
    const expense = await this.findById(tenantId, id);
    if (expense.status !== 'PENDING') {
      throw new ForbiddenException({ message: `Expense is already ${expense.status.toLowerCase()}`, code: 'EXPENSE_ALREADY_DECIDED' });
    }
    if (decision === 'REJECTED') {
      const updated = await this.expenses.decide(tenantId, id, { status: 'REJECTED', approvedById: actorId, approvedAt: new Date() });
      return updated ?? expense;
    }
    return this.prisma.$transaction(async (tx) => {
      const entry = await this.ledger.postExpense({ tenantId, expenseId: id, amountMinor: expense.amountMinor, currency: expense.currency, paidImmediately: true, occurredAt: expense.incurredAt }, tx);
      const updated = await tx.expense.update({
        where: { id },
        data: { status: 'APPROVED', approvedById: actorId, approvedAt: new Date(), ledgerEntryId: entry?.id ?? null },
      });
      return updated;
    });
  }

  /** Real, named seam for a future OCR integration — honestly reports
   * `'UNAVAILABLE'` today rather than faking extracted text (task 6.5's own
   * "gate OCR as unavailable here, don't fake extracted text" instruction). */
  requestOcr(): { status: 'UNAVAILABLE'; reason: string } {
    return { status: 'UNAVAILABLE', reason: 'No OCR engine or cloud OCR API key is configured in this environment.' };
  }
}
