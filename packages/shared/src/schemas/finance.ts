import { z } from 'zod';
import {
  EXPENSE_CATEGORIES,
  LEDGER_CORRECTION_REASON_CODES,
  ACCOUNTING_EXPORT_FORMATS,
  TAX_JURISDICTION_TYPES,
} from '../enums';
import { currencyCodeSchema } from '../money';

/**
 * Finance, Ledger & Tax (Phase 6 / implentationplanphase.md tasks 6.1-6.11,
 * featureslist.md §9). Same shared-schema-drives-both-validation-and-forms
 * pattern every prior phase's schema file uses.
 */

const minorStringSchema = z.string().regex(/^-?\d+$/, 'Minor-unit integer required');

// --- Ledger (6.1) ---

export const postLedgerCorrectionSchema = z.object({
  memo: z.string().min(1).max(500),
  reasonCode: z.enum(LEDGER_CORRECTION_REASON_CODES),
  lines: z
    .array(
      z.object({
        accountCode: z.string().min(1).max(60),
        direction: z.enum(['DEBIT', 'CREDIT']),
        amountMinor: minorStringSchema,
        currencyCode: currencyCodeSchema,
      }),
    )
    .min(2),
});
export type PostLedgerCorrectionInput = z.infer<typeof postLedgerCorrectionSchema>;

export const listLedgerQuerySchema = z.object({
  accountCode: z.string().optional(),
  sourceType: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type ListLedgerQuery = z.infer<typeof listLedgerQuerySchema>;

// --- Expenses (6.5) ---

export const createExpenseSchema = z.object({
  category: z.enum(EXPENSE_CATEGORIES),
  vendor: z.string().max(300).optional(),
  description: z.string().max(2000).optional(),
  amountMinor: minorStringSchema,
  currency: currencyCodeSchema,
  incurredAt: z.string().datetime(),
  receiptStorageKey: z.string().max(1000).optional(),
  receiptMimeType: z.string().max(120).optional(),
});
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;

export const decideExpenseSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  note: z.string().max(1000).optional(),
});
export type DecideExpenseInput = z.infer<typeof decideExpenseSchema>;

export const initExpenseReceiptUploadSchema = z.object({
  filename: z.string().min(1).max(300),
  mimeType: z.string().min(1).max(120),
});
export type InitExpenseReceiptUploadInput = z.infer<typeof initExpenseReceiptUploadSchema>;

// --- FX (6.3) ---

export const fxConvertQuerySchema = z.object({
  base: currencyCodeSchema,
  quote: currencyCodeSchema,
  amountMinor: minorStringSchema,
});
export type FxConvertQuery = z.infer<typeof fxConvertQuerySchema>;

// --- Earnings / Payouts / Reconciliation (6.4) ---

export const ingestEarningsSchema = z.object({
  connectionId: z.string().min(1),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
});
export type IngestEarningsInput = z.infer<typeof ingestEarningsSchema>;

export const reconcilePayoutSchema = z.object({
  actualAmountMinor: minorStringSchema,
  externalRef: z.string().max(300).optional(),
  receivedAt: z.string().datetime(),
});
export type ReconcilePayoutInput = z.infer<typeof reconcilePayoutSchema>;

// --- Period lock (6.6) ---

export const lockPeriodSchema = z.object({
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
});
export type LockPeriodInput = z.infer<typeof lockPeriodSchema>;

export const pnlQuerySchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
});
export type PnlQuery = z.infer<typeof pnlQuerySchema>;

// --- Tax Centre (6.7) ---

export const upsertTaxNexusSchema = z.object({
  jurisdictionType: z.enum(TAX_JURISDICTION_TYPES),
  jurisdictionCode: z.string().min(1).max(20),
  registeredAt: z.string().datetime().optional(),
  thresholdMinor: minorStringSchema.optional(),
  ratePct: z.number().min(0).max(100).default(0),
  isActive: z.boolean().default(true),
});
export type UpsertTaxNexusInput = z.infer<typeof upsertTaxNexusSchema>;

export const taxSummaryQuerySchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
});
export type TaxSummaryQuery = z.infer<typeof taxSummaryQuerySchema>;

// --- ZATCA (6.8) ---

export const generateZatcaInvoiceSchema = z.object({
  orderId: z.string().min(1),
  buyerVatNumber: z.string().max(30).optional(),
});
export type GenerateZatcaInvoiceInput = z.infer<typeof generateZatcaInvoiceSchema>;

// --- Accounting exports (6.9) ---

export const accountingExportQuerySchema = z.object({
  format: z.enum(ACCOUNTING_EXPORT_FORMATS),
  from: z.string().datetime(),
  to: z.string().datetime(),
});
export type AccountingExportQuery = z.infer<typeof accountingExportQuerySchema>;

// --- Billing (6.10) ---

export const subscribeSchema = z.object({
  planSlug: z.string().min(1).max(60),
});
export type SubscribeInput = z.infer<typeof subscribeSchema>;

export const recordUsageSchema = z.object({
  kind: z.enum(['AI_CREDIT', 'API_CALL', 'STORAGE_GB']),
  quantity: z.number().int(),
});
export type RecordUsageInput = z.infer<typeof recordUsageSchema>;

// --- Admin finance ops (6.11) ---

export const createDisputeSchema = z.object({
  sourceType: z.string().min(1).max(60),
  sourceId: z.string().min(1),
  amountMinor: minorStringSchema,
  currency: currencyCodeSchema,
  reasonCode: z.string().min(1).max(60),
  note: z.string().max(2000).optional(),
});
export type CreateDisputeInput = z.infer<typeof createDisputeSchema>;

export const resolveDisputeSchema = z.object({
  status: z.enum(['RESOLVED', 'REJECTED']),
  note: z.string().max(2000).optional(),
});
export type ResolveDisputeInput = z.infer<typeof resolveDisputeSchema>;

// --- Response / view shapes ---
// Note: `LedgerLineView`/`LedgerEntryView` live in `./ledger.ts` (the Phase
// 4.5 file this phase extends in place, per docs/OPEN_QUESTIONS.md #38) —
// not redeclared here to avoid a duplicate-export collision.

export interface ExpenseView {
  id: string;
  category: string;
  vendor: string | null;
  description: string | null;
  amountMinor: string;
  currency: string;
  incurredAt: string;
  status: string;
  receiptStorageKey: string | null;
  ocrStatus: string;
  ocrText: string | null;
  approvedAt: string | null;
  createdAt: string;
}

export interface FeeBreakdownView {
  type: string;
  amountMinor: string;
  currency: string;
}

export interface OrderMarginView {
  orderId: string;
  orderNumber: string;
  currency: string;
  grossMinor: string;
  fees: FeeBreakdownView[];
  netMinor: string;
  marginPct: number;
}

export interface FinancePayoutLineView {
  id: string;
  orderId: string | null;
  description: string;
  amountMinor: string;
  currency: string;
  reconciledLedgerLineId: string | null;
}

export interface FinancePayoutView {
  id: string;
  connectionId: string | null;
  connectorSlug: string;
  currency: string;
  amountMinor: string;
  expectedMinor: string | null;
  varianceMinor: string | null;
  varianceStatus: string;
  status: string;
  periodStart: string;
  periodEnd: string;
  receivedAt: string | null;
  reconciledAt: string | null;
  lines: FinancePayoutLineView[];
}

export interface PnlReportView {
  from: string;
  to: string;
  currency: string;
  revenueMinor: string;
  discountsMinor: string;
  feesMinor: string;
  fxGainLossMinor: string;
  expensesMinor: string;
  netProfitMinor: string;
  cashInMinor: string;
  cashOutMinor: string;
  netCashFlowMinor: string;
}

export interface TaxSummaryView {
  from: string;
  to: string;
  currency: string;
  totalTaxCollectedMinor: string;
  byJurisdiction: Array<{ jurisdictionType: string; jurisdictionCode: string; taxableSalesMinor: string; taxCollectedMinor: string; ratePct: number; overThreshold: boolean }>;
}

export interface ReconciliationSummaryView {
  connectionId: string | null;
  connectorSlug: string;
  expectedMinor: string;
  actualMinor: string;
  varianceMinor: string;
  variancePct: number;
  varianceStatus: string;
}
