import { describe, expect, it, vi } from 'vitest';
import { AccountingExportService } from '../src/finance/accounting-export.service';
import type { LedgerRepository } from '../src/repositories/ledger.repository';

const entries = [
  {
    occurredAt: new Date('2026-08-05T00:00:00.000Z'),
    memo: 'Order revenue recognition for order-1',
    lines: [
      { accountCode: 'accounts_receivable', direction: 'DEBIT', amountMinor: 1_150n, currencyCode: 'SAR' },
      { accountCode: 'sales_revenue', direction: 'CREDIT', amountMinor: 1_000n, currencyCode: 'SAR' },
      { accountCode: 'tax_payable', direction: 'CREDIT', amountMinor: 150n, currencyCode: 'SAR' },
    ],
  },
];

function makeService() {
  const ledger = { list: vi.fn().mockResolvedValue({ items: entries, nextCursor: null }) };
  return { service: new AccountingExportService(ledger as unknown as LedgerRepository), ledger };
}

describe('AccountingExportService', () => {
  it('exportCsv emits one row per ledger line with a header', async () => {
    const { service } = makeService();
    const csv = await service.exportCsv('t1', new Date('2026-08-01'), new Date('2026-08-31'));
    const rows = csv.split('\r\n');
    expect(rows[0]).toBe('Date,Account,Description,Direction,Amount,Currency');
    expect(rows).toHaveLength(4); // header + 3 lines
    expect(rows[1]).toContain('accounts_receivable');
    expect(rows[1]).toContain('11.50');
  });

  it('exportQuickBooksIif emits a real TRNS/SPL/ENDTRNS block that balances', async () => {
    const { service } = makeService();
    const iif = await service.exportQuickBooksIif('t1', new Date('2026-08-01'), new Date('2026-08-31'));
    expect(iif).toContain('!TRNS\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tMEMO');
    expect(iif).toContain('TRNS\tGENERAL JOURNAL\t08/05/2026\taccounts_receivable\t\t11.50');
    expect(iif).toContain('ENDTRNS');
    // two SPL lines for the two credit lines
    expect((iif.match(/\nSPL\t/g) ?? []).length).toBe(2);
  });

  it('exportXeroCsv shows DEBIT positive and CREDIT negative in one signed Amount column', async () => {
    const { service } = makeService();
    const csv = await service.exportXeroCsv('t1', new Date('2026-08-01'), new Date('2026-08-31'));
    expect(csv).toContain('Date,Amount,Payee,Description,Reference');
    expect(csv).toContain('2026-08-05,11.50,accounts_receivable');
    expect(csv).toContain('2026-08-05,-10.00,sales_revenue');
    expect(csv).toContain('2026-08-05,-1.50,tax_payable');
  });

  it('exportZohoCsv uses separate Debit/Credit columns', async () => {
    const { service } = makeService();
    const csv = await service.exportZohoCsv('t1', new Date('2026-08-01'), new Date('2026-08-31'));
    expect(csv).toContain('Date,Description,Debit,Credit');
    const rows = csv.split('\r\n');
    expect(rows[1]).toMatch(/^2026-08-05,.*,11\.50,$/);
    expect(rows[2]).toMatch(/^2026-08-05,.*,,10\.00$/);
  });
});
