import { Body, Controller, Get, Headers, NotFoundException, Param, Post, Put, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import {
  accountingExportQuerySchema,
  createDisputeSchema,
  createExpenseSchema,
  decideExpenseSchema,
  fxConvertQuerySchema,
  generateZatcaInvoiceSchema,
  ingestEarningsSchema,
  initExpenseReceiptUploadSchema,
  listLedgerQuerySchema,
  lockPeriodSchema,
  pnlQuerySchema,
  postLedgerCorrectionSchema,
  reconcilePayoutSchema,
  resolveDisputeSchema,
  taxSummaryQuerySchema,
  upsertTaxNexusSchema,
} from '@omnisell/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContextGuard } from '../auth/tenant-context.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import type { TenantContext } from '../auth/tenant-context.guard';
import { PoliciesGuard } from '../rbac/policies.guard';
import { CheckPolicies } from '../rbac/check-policies.decorator';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { AuditLogService } from '../audit/audit-log.service';

import { LedgerService } from '../points/ledger.service';
import { LedgerRepository } from '../repositories/ledger.repository';
import { FeeDecompositionService } from './fee-decomposition.service';
import { FinancePayoutService } from './finance-payout.service';
import { ExpenseService } from './expense.service';
import { PeriodLockService } from './period-lock.service';
import { PnlService } from './pnl.service';
import { TaxCentreService } from './tax-centre.service';
import { AccountingExportService } from './accounting-export.service';
import { FinanceDisputeService } from './finance-dispute.service';
import { FxService } from './fx/fx.service';
import { ZatcaInvoiceService } from './zatca/zatca-invoice.service';
import { ZatcaPdfService } from './zatca/zatca-pdf.service';
import { TenantRepository } from '../repositories/tenant.repository';
import { ConnectionRepository } from '../repositories/connection.repository';

function toLedgerLineInputs(lines: Array<{ accountCode: string; direction: 'DEBIT' | 'CREDIT'; amountMinor: string; currencyCode: string }>) {
  return lines.map((l) => ({ accountCode: l.accountCode, direction: l.direction, amountMinor: BigInt(l.amountMinor), currencyCode: l.currencyCode }));
}

/** `exactOptionalPropertyTypes` means `{ status: undefined }` is not the same
 * as omitting `status` — this strips undefined query-param values so an
 * absent filter is genuinely absent, not present-but-undefined. */
type DefinedOnly<T> = { [K in keyof T]?: Exclude<T[K], undefined> };

function filterDefined<T extends Record<string, unknown>>(input: T): DefinedOnly<T> {
  const result: DefinedOnly<T> = {};
  for (const key of Object.keys(input) as Array<keyof T>) {
    const value = input[key];
    if (value !== undefined) {
      result[key] = value as Exclude<T[keyof T], undefined>;
    }
  }
  return result;
}

/**
 * Finance, Ledger & Tax (Phase 6, implentationplanphase.md tasks 6.1-6.9/
 * 6.11). Route surface follows prompt.md's literal API list (`GET /earnings`,
 * `GET /fees`, `GET /ledger`, `GET /payouts`, `POST /payouts/:id/reconcile`,
 * `GET|POST /expenses`, `GET /tax/vat-summary`, `GET /tax/us-summary`,
 * `POST /tax/zatca/invoice`, `GET /reports/pnl`, `GET /exports/accounting`)
 * plus real extensions this phase's tasks need (period locks, manual ledger
 * corrections, tax nexus config, disputes) — the same "extend the literal
 * surface with what the task actually needs" pattern every prior phase's
 * controller already follows (e.g. Phase 5's saved views/routing rules).
 */
@Controller()
@UseGuards(JwtAuthGuard, TenantContextGuard)
export class FinanceController {
  constructor(
    private readonly ledger: LedgerService,
    private readonly ledgerRepo: LedgerRepository,
    private readonly feeDecomposition: FeeDecompositionService,
    private readonly payouts: FinancePayoutService,
    private readonly expenses: ExpenseService,
    private readonly periodLocks: PeriodLockService,
    private readonly pnl: PnlService,
    private readonly taxCentre: TaxCentreService,
    private readonly accountingExport: AccountingExportService,
    private readonly disputes: FinanceDisputeService,
    private readonly fx: FxService,
    private readonly zatca: ZatcaInvoiceService,
    private readonly zatcaPdf: ZatcaPdfService,
    private readonly tenants: TenantRepository,
    private readonly connections: ConnectionRepository,
    private readonly idempotency: IdempotencyService,
    private readonly audit: AuditLogService,
  ) {}

  // --- Earnings / Payouts / Reconciliation (6.4) ---

  @Get('earnings')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('read', 'FinancePayout'))
  async listEarnings(@CurrentTenant() tenant: TenantContext, @Query('status') status?: string, @Query('varianceStatus') varianceStatus?: string, @Query('cursor') cursor?: string, @Query('limit') limit = '20') {
    return this.payouts.list(tenant.tenantId, filterDefined({ status, varianceStatus }), cursor, Number(limit));
  }

  @Post('earnings/ingest')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('create', 'FinancePayout'))
  async ingestEarnings(@CurrentTenant() tenant: TenantContext, @Body() body: unknown, @Headers('idempotency-key') idempotencyKey?: string) {
    const input = ingestEarningsSchema.parse(body);
    const result = await this.idempotency.run(
      { scope: 'finance.earnings.ingest', key: idempotencyKey, ownerId: tenant.userId, requestBody: input },
      async () => {
        const connection = await this.connections.findById(tenant.tenantId, input.connectionId);
        if (connection === null) {
          throw new NotFoundException({ message: 'Connection not found', code: 'CONNECTION_NOT_FOUND' });
        }
        const payout = await this.payouts.createExpectedPayout(tenant.tenantId, input.connectionId, connection.connectorSlug, new Date(input.periodStart), new Date(input.periodEnd));
        await this.audit.record({ tenantId: tenant.tenantId, actorId: tenant.userId, action: 'finance.earnings_ingested', entityType: 'FinancePayout', entityId: payout.id, after: payout });
        return { status: 201, body: payout };
      },
    );
    return result.body;
  }

  @Get('payouts')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('read', 'FinancePayout'))
  async listPayouts(@CurrentTenant() tenant: TenantContext, @Query('status') status?: string, @Query('varianceStatus') varianceStatus?: string, @Query('cursor') cursor?: string, @Query('limit') limit = '20') {
    return this.payouts.list(tenant.tenantId, filterDefined({ status, varianceStatus }), cursor, Number(limit));
  }

  @Get('payouts/:id')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('read', 'FinancePayout'))
  async getPayout(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.payouts.findById(tenant.tenantId, id);
  }

  @Post('payouts/:id/reconcile')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('update', 'FinancePayout'))
  async reconcilePayout(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') idempotencyKey?: string) {
    const input = reconcilePayoutSchema.parse(body);
    const result = await this.idempotency.run(
      { scope: 'finance.payout.reconcile', key: idempotencyKey, ownerId: tenant.userId, requestBody: { id, input } },
      async () => {
        const payout = await this.payouts.reconcile(
          tenant.tenantId,
          id,
          { actualAmountMinor: BigInt(input.actualAmountMinor), ...(input.externalRef !== undefined ? { externalRef: input.externalRef } : {}), receivedAt: new Date(input.receivedAt) },
          tenant.userId,
        );
        await this.audit.record({ tenantId: tenant.tenantId, actorId: tenant.userId, action: 'finance.payout_reconciled', entityType: 'FinancePayout', entityId: id, after: payout });
        return { status: 200, body: payout };
      },
    );
    return result.body;
  }

  @Post('payouts/:id/ingest-connector')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('read', 'FinancePayout'))
  async ingestConnectorEarnings(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Query('connectionId') connectionId: string) {
    const payout = await this.payouts.findById(tenant.tenantId, id);
    return this.payouts.ingestFromConnector(tenant.tenantId, connectionId, payout.periodStart, payout.periodEnd);
  }

  // --- Fees & Margin Breakdown (6.2) ---

  @Get('fees')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('read', 'FinancePayout'))
  async getFees(@CurrentTenant() tenant: TenantContext, @Query() query: Record<string, string>) {
    const input = pnlQuerySchema.parse(query);
    return this.pnl.getFeeBreakdown(tenant.tenantId, new Date(input.from), new Date(input.to));
  }

  @Post('orders/:id/recognize')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('update', 'FinancePayout'))
  async recognizeOrder(@CurrentTenant() tenant: TenantContext, @Param('id') orderId: string) {
    return this.feeDecomposition.recognizeOrder(tenant.tenantId, orderId);
  }

  // --- Ledger (6.1/6.6/6.11) ---

  @Get('ledger')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('read', 'FinancePayout'))
  async listLedger(@CurrentTenant() tenant: TenantContext, @Query() query: Record<string, string | undefined>) {
    const input = listLedgerQuerySchema.parse(query);
    return this.ledgerRepo.list(
      tenant.tenantId,
      { ...(input.accountCode !== undefined ? { accountCode: input.accountCode } : {}), ...(input.sourceType !== undefined ? { sourceType: input.sourceType } : {}), ...(input.from !== undefined ? { from: new Date(input.from) } : {}), ...(input.to !== undefined ? { to: new Date(input.to) } : {}) },
      input.cursor,
      input.limit,
    );
  }

  @Post('ledger/corrections')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('create', 'PeriodLock'))
  async postCorrection(@CurrentTenant() tenant: TenantContext, @Body() body: unknown, @Headers('idempotency-key') idempotencyKey?: string) {
    const input = postLedgerCorrectionSchema.parse(body);
    const result = await this.idempotency.run(
      { scope: 'finance.ledger.correction', key: idempotencyKey, ownerId: tenant.userId, requestBody: input },
      async () => {
        const entry = await this.ledger.postManualCorrection({ tenantId: tenant.tenantId, memo: input.memo, reasonCode: input.reasonCode, actorId: tenant.userId, lines: toLedgerLineInputs(input.lines) });
        await this.audit.record({ tenantId: tenant.tenantId, actorId: tenant.userId, action: 'finance.ledger_correction', entityType: 'LedgerEntry', entityId: entry.id, after: entry });
        return { status: 201, body: entry };
      },
    );
    return result.body;
  }

  @Get('ledger/period-locks')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('read', 'PeriodLock'))
  async listPeriodLocks(@CurrentTenant() tenant: TenantContext) {
    return this.periodLocks.list(tenant.tenantId);
  }

  @Post('ledger/period-locks')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('create', 'PeriodLock'))
  async lockPeriod(@CurrentTenant() tenant: TenantContext, @Body() body: unknown, @Headers('idempotency-key') idempotencyKey?: string) {
    const input = lockPeriodSchema.parse(body);
    const result = await this.idempotency.run(
      { scope: 'finance.period-lock.lock', key: idempotencyKey, ownerId: tenant.userId, requestBody: input },
      async () => {
        const lock = await this.periodLocks.lock(tenant.tenantId, new Date(input.periodStart), new Date(input.periodEnd), tenant.userId);
        await this.audit.record({ tenantId: tenant.tenantId, actorId: tenant.userId, action: 'finance.period_locked', entityType: 'PeriodLock', entityId: lock.id, after: lock });
        return { status: 201, body: lock };
      },
    );
    return result.body;
  }

  // --- P&L / cash-flow reports (6.6) ---

  @Get('reports/pnl')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('read', 'FinancePayout'))
  async getPnl(@CurrentTenant() tenant: TenantContext, @Query() query: Record<string, string>) {
    const input = pnlQuerySchema.parse(query);
    return this.pnl.getReport(tenant.tenantId, new Date(input.from), new Date(input.to));
  }

  // --- Expenses (6.5) ---

  @Post('expenses/upload-init')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('create', 'Expense'))
  async initExpenseReceiptUpload(@CurrentTenant() tenant: TenantContext, @Body() body: unknown) {
    const input = initExpenseReceiptUploadSchema.parse(body);
    return this.expenses.initReceiptUpload(tenant.tenantId, input.filename, input.mimeType);
  }

  @Get('expenses')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('read', 'Expense'))
  async listExpenses(@CurrentTenant() tenant: TenantContext, @Query('status') status?: string, @Query('category') category?: string, @Query('cursor') cursor?: string, @Query('limit') limit = '20') {
    return this.expenses.list(tenant.tenantId, filterDefined({ status, category }), cursor, Number(limit));
  }

  @Get('expenses/:id')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('read', 'Expense'))
  async getExpense(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.expenses.findById(tenant.tenantId, id);
  }

  @Post('expenses')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('create', 'Expense'))
  async createExpense(@CurrentTenant() tenant: TenantContext, @Body() body: unknown, @Headers('idempotency-key') idempotencyKey?: string) {
    const input = createExpenseSchema.parse(body);
    const result = await this.idempotency.run(
      { scope: 'finance.expense.create', key: idempotencyKey, ownerId: tenant.userId, requestBody: input },
      async () => {
        const expense = await this.expenses.create(tenant.tenantId, tenant.userId, {
          category: input.category,
          ...(input.vendor !== undefined ? { vendor: input.vendor } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          amountMinor: BigInt(input.amountMinor),
          currency: input.currency,
          incurredAt: new Date(input.incurredAt),
          ...(input.receiptStorageKey !== undefined ? { receiptStorageKey: input.receiptStorageKey } : {}),
          ...(input.receiptMimeType !== undefined ? { receiptMimeType: input.receiptMimeType } : {}),
        });
        await this.audit.record({ tenantId: tenant.tenantId, actorId: tenant.userId, action: 'finance.expense_created', entityType: 'Expense', entityId: expense.id, after: expense });
        return { status: 201, body: expense };
      },
    );
    return result.body;
  }

  @Post('expenses/:id/decide')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('update', 'Expense'))
  async decideExpense(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') idempotencyKey?: string) {
    const input = decideExpenseSchema.parse(body);
    const result = await this.idempotency.run(
      { scope: 'finance.expense.decide', key: idempotencyKey, ownerId: tenant.userId, requestBody: { id, input } },
      async () => {
        const expense = await this.expenses.decide(tenant.tenantId, id, input.decision, tenant.userId);
        await this.audit.record({ tenantId: tenant.tenantId, actorId: tenant.userId, action: `finance.expense_${input.decision.toLowerCase()}`, entityType: 'Expense', entityId: id, after: expense });
        return { status: 200, body: expense };
      },
    );
    return result.body;
  }

  // --- FX (6.3) ---

  @Get('fx/convert')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('read', 'FinancePayout'))
  async convertFx(@Query() query: Record<string, string>) {
    const input = fxConvertQuerySchema.parse(query);
    return this.fx.convert(input.base, input.quote, BigInt(input.amountMinor));
  }

  // --- Tax Centre (6.7) ---

  @Get('tax/vat-summary')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('read', 'TaxNexus'))
  async getVatSummary(@CurrentTenant() tenant: TenantContext, @Query() query: Record<string, string>) {
    const input = taxSummaryQuerySchema.parse(query);
    const summary = await this.taxCentre.getSummary(tenant.tenantId, new Date(input.from), new Date(input.to));
    return { ...summary, byJurisdiction: summary.byJurisdiction.filter((j) => j.jurisdictionType === 'GCC_VAT' || j.jurisdictionType === 'EU_OSS') };
  }

  @Get('tax/us-summary')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('read', 'TaxNexus'))
  async getUsSummary(@CurrentTenant() tenant: TenantContext, @Query() query: Record<string, string>) {
    const input = taxSummaryQuerySchema.parse(query);
    const summary = await this.taxCentre.getSummary(tenant.tenantId, new Date(input.from), new Date(input.to));
    return { ...summary, byJurisdiction: summary.byJurisdiction.filter((j) => j.jurisdictionType === 'US_STATE') };
  }

  @Get('tax/withholding-notes')
  async getWithholdingNotes() {
    return this.taxCentre.getWithholdingNotes();
  }

  @Get('tax/nexus')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('read', 'TaxNexus'))
  async listNexus(@CurrentTenant() tenant: TenantContext) {
    return this.taxCentre.listNexuses(tenant.tenantId);
  }

  @Put('tax/nexus')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('update', 'TaxNexus'))
  async upsertNexus(@CurrentTenant() tenant: TenantContext, @Body() body: unknown) {
    const input = upsertTaxNexusSchema.parse(body);
    const nexus = await this.taxCentre.upsertNexus(tenant.tenantId, {
      jurisdictionType: input.jurisdictionType,
      jurisdictionCode: input.jurisdictionCode,
      registeredAt: input.registeredAt !== undefined ? new Date(input.registeredAt) : null,
      thresholdMinor: input.thresholdMinor !== undefined ? BigInt(input.thresholdMinor) : null,
      ratePct: input.ratePct,
      isActive: input.isActive,
    });
    await this.audit.record({ tenantId: tenant.tenantId, actorId: tenant.userId, action: 'finance.tax_nexus_upserted', entityType: 'TaxNexus', entityId: nexus.id, after: nexus });
    return nexus;
  }

  @Put('settings/vat-number')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('update', 'Tenant'))
  async setVatNumber(@CurrentTenant() tenant: TenantContext, @Body() body: { vatNumber: string }) {
    return this.tenants.updateVatNumber(tenant.tenantId, body.vatNumber);
  }

  // --- ZATCA Phase 2 (6.8, behind zatca_einvoicing) ---

  @Post('tax/zatca/invoice')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('create', 'Invoice'))
  async generateZatcaInvoice(@CurrentTenant() tenant: TenantContext, @Body() body: unknown, @Headers('idempotency-key') idempotencyKey?: string) {
    const input = generateZatcaInvoiceSchema.parse(body);
    const result = await this.idempotency.run(
      { scope: 'finance.zatca.invoice', key: idempotencyKey, ownerId: tenant.userId, requestBody: input },
      async () => {
        const invoice = await this.zatca.generateForOrder(tenant.tenantId, input.orderId, tenant.userId, input.buyerVatNumber);
        await this.audit.record({ tenantId: tenant.tenantId, actorId: tenant.userId, action: 'finance.zatca_invoice_generated', entityType: 'Invoice', entityId: invoice.id, after: invoice });
        return { status: 201, body: invoice };
      },
    );
    return result.body;
  }

  @Get('tax/zatca/invoices/:id/pdf')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('read', 'Invoice'))
  async downloadZatcaInvoicePdf(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Query('locale') locale: 'en' | 'ar' = 'en', @Res() res: Response) {
    const pdf = await this.zatcaPdf.renderPdf(tenant.tenantId, id, locale);
    res.setHeader('Content-Type', 'application/pdf');
    res.send(Buffer.from(pdf));
  }

  // --- Accounting exports (6.9) ---

  @Get('exports/accounting')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('read', 'FinancePayout'))
  async exportAccounting(@CurrentTenant() tenant: TenantContext, @Query() query: Record<string, string>, @Res() res: Response) {
    const input = accountingExportQuerySchema.parse(query);
    const from = new Date(input.from);
    const to = new Date(input.to);
    let content: string;
    let filename: string;
    switch (input.format) {
      case 'QUICKBOOKS_IIF':
        content = await this.accountingExport.exportQuickBooksIif(tenant.tenantId, from, to);
        filename = 'omnisell-ledger.iif';
        break;
      case 'XERO_CSV':
        content = await this.accountingExport.exportXeroCsv(tenant.tenantId, from, to);
        filename = 'omnisell-xero.csv';
        break;
      case 'ZOHO_CSV':
        content = await this.accountingExport.exportZohoCsv(tenant.tenantId, from, to);
        filename = 'omnisell-zoho.csv';
        break;
      default:
        content = await this.accountingExport.exportCsv(tenant.tenantId, from, to);
        filename = 'omnisell-ledger.csv';
    }
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(content);
  }

  // --- Admin finance ops: disputes (6.11) ---

  @Get('disputes')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('read', 'FinanceDispute'))
  async listDisputes(@CurrentTenant() tenant: TenantContext, @Query('status') status?: string) {
    return this.disputes.list(tenant.tenantId, status);
  }

  @Post('disputes')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('create', 'FinanceDispute'))
  async createDispute(@CurrentTenant() tenant: TenantContext, @Body() body: unknown, @Headers('idempotency-key') idempotencyKey?: string) {
    const input = createDisputeSchema.parse(body);
    const result = await this.idempotency.run(
      { scope: 'finance.dispute.create', key: idempotencyKey, ownerId: tenant.userId, requestBody: input },
      async () => {
        const dispute = await this.disputes.create(tenant.tenantId, tenant.userId, {
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          amountMinor: BigInt(input.amountMinor),
          currency: input.currency,
          reasonCode: input.reasonCode,
          ...(input.note !== undefined ? { note: input.note } : {}),
        });
        await this.audit.record({ tenantId: tenant.tenantId, actorId: tenant.userId, action: 'finance.dispute_created', entityType: 'FinanceDispute', entityId: dispute.id, after: dispute });
        return { status: 201, body: dispute };
      },
    );
    return result.body;
  }

  @Post('disputes/:id/resolve')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('update', 'FinanceDispute'))
  async resolveDispute(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') idempotencyKey?: string) {
    const input = resolveDisputeSchema.parse(body);
    const result = await this.idempotency.run(
      { scope: 'finance.dispute.resolve', key: idempotencyKey, ownerId: tenant.userId, requestBody: { id, input } },
      async () => {
        const dispute = await this.disputes.resolve(tenant.tenantId, id, input.status, tenant.userId, input.note);
        await this.audit.record({ tenantId: tenant.tenantId, actorId: tenant.userId, action: 'finance.dispute_resolved', entityType: 'FinanceDispute', entityId: id, after: dispute });
        return { status: 200, body: dispute };
      },
    );
    return result.body;
  }
}
