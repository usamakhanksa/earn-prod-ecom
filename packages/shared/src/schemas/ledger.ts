import { LEDGER_ACCOUNT_CODES, LEDGER_DIRECTIONS } from '../enums';

/**
 * Minimal double-entry ledger primitive DTOs (prompt.md "CONSUMER MODE" section
 * / docs/points-extension.md §7.4). No zod schema needed yet — nothing external
 * posts to the ledger directly in this phase; `LedgerService.postBalancedEntry`
 * is the only writer and is called from `RedemptionService`. These are the
 * read-side view shapes for admin/finance inspection.
 */
export interface LedgerLineView {
  id: string;
  accountCode: (typeof LEDGER_ACCOUNT_CODES)[number] | string;
  direction: (typeof LEDGER_DIRECTIONS)[number];
  amountMinor: string;
  currencyCode: string;
}

export interface LedgerEntryView {
  id: string;
  occurredAt: string;
  memo: string;
  sourceType: string;
  sourceId: string | null;
  // Phase 6 additions (task 6.1/6.11) — additive, optional-safe for any
  // pre-Phase-6 caller shape: `isAdjustment`/`reasonCode` distinguish a
  // normal posting from a manual correction made after a period lock.
  isAdjustment: boolean;
  reasonCode: string | null;
  lines: LedgerLineView[];
}
