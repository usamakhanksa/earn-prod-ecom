import { Injectable } from '@nestjs/common';
import { LedgerRepository } from '../repositories/ledger.repository';

/**
 * Accounting exports (Phase 6, task 6.9): CSV (always real, exercised fully
 * offline), plus file-format exports for QuickBooks (IIF), Xero (bank-
 * statement CSV), and Zoho Books (bank-statement CSV) — all three built
 * against each provider's own REAL, PUBLISHED file-format documentation
 * (confirmed via WebSearch this pass — see docs/CONNECTORS.md/docs/DEBT.md
 * for the citation trail), not guessed. A live API PUSH to any of the three
 * (as opposed to a downloadable file the user imports themselves) is
 * explicitly NOT built this pass — see this class's own doc comment on each
 * method for exactly what's real vs. out of scope.
 *
 * IIF (QuickBooks Desktop): tab-separated text, `!TRNS`/`!SPL`/`!ENDTRNS`
 * header rows followed by one `TRNS` line + one or more `SPL` line(s) +
 * `ENDTRNS` per transaction, the `SPL` lines' signed amounts balancing
 * against the `TRNS` line's amount to zero — confirmed via QuickBooks'
 * own IIF format documentation and multiple independent format references.
 *
 * Xero / Zoho Books: both import a plain CSV bank-statement-shaped file
 * (Date + signed Amount + Description, or Date + Description + Debit/Credit)
 * rather than a rigid ledger-specific schema — confirmed via each product's
 * own bank-import help pages. This service emits the safer, most literally
 * documented shape for each (Xero: single signed `Amount` column; Zoho:
 * separate `Debit`/`Credit` columns — Zoho's own docs describe this as one
 * of its two explicitly supported column layouts).
 */
@Injectable()
export class AccountingExportService {
  constructor(private readonly ledger: LedgerRepository) {}

  private async fetchAllEntries(tenantId: string, from: Date, to: Date) {
    const entries: Array<{ occurredAt: Date; memo: string; lines: Array<{ accountCode: string; direction: string; amountMinor: bigint; currencyCode: string }> }> = [];
    let cursor: string | undefined;
    for (;;) {
      const page = await this.ledger.list(tenantId, { from, to }, cursor, 200);
      entries.push(...page.items);
      if (page.nextCursor === null) {
        break;
      }
      cursor = page.nextCursor;
    }
    return entries;
  }

  /** Always-real, fully-offline-verifiable CSV — one row per ledger LINE. */
  async exportCsv(tenantId: string, from: Date, to: Date): Promise<string> {
    const entries = await this.fetchAllEntries(tenantId, from, to);
    const rows = ['Date,Account,Description,Direction,Amount,Currency'];
    for (const entry of entries) {
      for (const line of entry.lines) {
        rows.push(
          [
            entry.occurredAt.toISOString().slice(0, 10),
            line.accountCode,
            csvEscape(entry.memo),
            line.direction,
            minorToDecimal(line.amountMinor),
            line.currencyCode,
          ].join(','),
        );
      }
    }
    return rows.join('\r\n');
  }

  /** QuickBooks Desktop IIF export. */
  async exportQuickBooksIif(tenantId: string, from: Date, to: Date): Promise<string> {
    const entries = await this.fetchAllEntries(tenantId, from, to);
    const lines = ['!TRNS\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tMEMO', '!SPL\tSPLID\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tMEMO', '!ENDTRNS'];
    for (const entry of entries) {
      if (entry.lines.length === 0) {
        continue;
      }
      const date = formatUsDate(entry.occurredAt);
      const first = entry.lines[0]!;
      const firstAmount = iifSignedAmount(first);
      lines.push(`TRNS\tGENERAL JOURNAL\t${date}\t${first.accountCode}\t\t${firstAmount}\t${iifEscape(entry.memo)}`);
      for (let i = 1; i < entry.lines.length; i += 1) {
        const split = entry.lines[i]!;
        lines.push(`SPL\t${i}\tGENERAL JOURNAL\t${date}\t${split.accountCode}\t\t${iifSignedAmount(split)}\t${iifEscape(entry.memo)}`);
      }
      lines.push('ENDTRNS');
    }
    return lines.join('\r\n');
  }

  /** Xero bank-statement-style CSV: Date, Amount (signed), Payee,
   * Description, Reference — one row per ledger LINE, DEBIT shown positive
   * (money in) and CREDIT negative (money out), matching Xero's documented
   * "both income and expense in one signed Amount column" convention. */
  async exportXeroCsv(tenantId: string, from: Date, to: Date): Promise<string> {
    const entries = await this.fetchAllEntries(tenantId, from, to);
    const rows = ['Date,Amount,Payee,Description,Reference'];
    for (const entry of entries) {
      for (const line of entry.lines) {
        const signed = line.direction === 'DEBIT' ? minorToDecimal(line.amountMinor) : `-${minorToDecimal(line.amountMinor)}`;
        rows.push([formatIsoDate(entry.occurredAt), signed, line.accountCode, csvEscape(entry.memo), ''].join(','));
      }
    }
    return rows.join('\r\n');
  }

  /** Zoho Books bank-statement-style CSV: Date, Description, Debit, Credit —
   * Zoho's own docs name this "double column" layout as one of the two
   * explicitly supported shapes. */
  async exportZohoCsv(tenantId: string, from: Date, to: Date): Promise<string> {
    const entries = await this.fetchAllEntries(tenantId, from, to);
    const rows = ['Date,Description,Debit,Credit'];
    for (const entry of entries) {
      for (const line of entry.lines) {
        const debit = line.direction === 'DEBIT' ? minorToDecimal(line.amountMinor) : '';
        const credit = line.direction === 'CREDIT' ? minorToDecimal(line.amountMinor) : '';
        rows.push([formatIsoDate(entry.occurredAt), csvEscape(`${line.accountCode}: ${entry.memo}`), debit, credit].join(','));
      }
    }
    return rows.join('\r\n');
  }
}

function minorToDecimal(minor: bigint): string {
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  const str = abs.toString().padStart(3, '0');
  const value = `${str.slice(0, -2)}.${str.slice(-2)}`;
  return negative ? `-${value}` : value;
}

function iifSignedAmount(line: { direction: string; amountMinor: bigint }): string {
  return line.direction === 'DEBIT' ? minorToDecimal(line.amountMinor) : `-${minorToDecimal(line.amountMinor)}`;
}

function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatUsDate(date: Date): string {
  return `${String(date.getUTCMonth() + 1).padStart(2, '0')}/${String(date.getUTCDate()).padStart(2, '0')}/${date.getUTCFullYear()}`;
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function iifEscape(value: string): string {
  return value.replace(/\t/g, ' ').replace(/[\r\n]/g, ' ');
}
