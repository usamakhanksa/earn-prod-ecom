import { describe, expect, it, vi } from 'vitest';
import { ExpenseService } from '../src/finance/expense.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { ExpenseRepository } from '../src/repositories/expense.repository';
import type { S3PresignService } from '../src/common/storage/s3-presign.service';
import type { LedgerService } from '../src/points/ledger.service';

const expenseRow = { id: 'exp-1', tenantId: 't1', status: 'PENDING', amountMinor: 500n, currency: 'USD', incurredAt: new Date('2026-08-01') };

function makeService() {
  const prisma = { $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => fn({ expense: { update: vi.fn().mockImplementation((args) => Promise.resolve({ ...expenseRow, ...args.data })) } })) };
  const expenses = {
    create: vi.fn().mockImplementation((data) => Promise.resolve({ id: 'exp-1', ...data })),
    findById: vi.fn().mockResolvedValue(expenseRow),
    decide: vi.fn().mockImplementation((_t, _id, data) => Promise.resolve({ ...expenseRow, ...data })),
  };
  const presign = { buildStorageKey: vi.fn().mockReturnValue('tenants/t1/receipts/x.png'), presignPut: vi.fn().mockResolvedValue({ storageKey: 'k', url: 'https://x', expiresAt: new Date() }) };
  const ledger = { postExpense: vi.fn().mockResolvedValue({ id: 'entry-1' }) };
  return {
    service: new ExpenseService(prisma as unknown as PrismaService, expenses as unknown as ExpenseRepository, presign as unknown as S3PresignService, ledger as unknown as LedgerService),
    expenses,
    ledger,
  };
}

describe('ExpenseService', () => {
  it('initReceiptUpload builds a real presigned PUT URL under a receipts prefix', async () => {
    const { service } = makeService();
    const result = await service.initReceiptUpload('t1', 'receipt.png', 'image/png');
    expect(result.url).toBe('https://x');
  });

  it('create() always sets ocrStatus to UNAVAILABLE — never fabricates extracted text', async () => {
    const { service, expenses } = makeService();
    await service.create('t1', 'user-1', { category: 'SOFTWARE', amountMinor: 1000n, currency: 'USD', incurredAt: new Date() });
    expect(expenses.create).toHaveBeenCalledWith(expect.objectContaining({ ocrStatus: 'UNAVAILABLE' }));
  });

  it('requestOcr honestly reports UNAVAILABLE rather than faking a result', () => {
    const { service } = makeService();
    expect(service.requestOcr().status).toBe('UNAVAILABLE');
  });

  it('decide(APPROVED) posts a real ledger entry and stamps approvedAt/ledgerEntryId', async () => {
    const { service, ledger } = makeService();
    const result = await service.decide('t1', 'exp-1', 'APPROVED', 'approver-1');
    expect(ledger.postExpense).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 't1', expenseId: 'exp-1', paidImmediately: true }), expect.anything());
    expect(result.status).toBe('APPROVED');
  });

  it('decide(REJECTED) does not touch the ledger', async () => {
    const { service, ledger } = makeService();
    await service.decide('t1', 'exp-1', 'REJECTED', 'approver-1');
    expect(ledger.postExpense).not.toHaveBeenCalled();
  });

  it('refuses to re-decide an already-decided expense', async () => {
    const { service, expenses } = makeService();
    expenses.findById.mockResolvedValue({ ...expenseRow, status: 'APPROVED' });
    await expect(service.decide('t1', 'exp-1', 'APPROVED', 'approver-1')).rejects.toThrow(/already/);
  });
});
