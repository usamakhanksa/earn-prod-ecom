import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { AuditLogModule } from '../audit/audit-log.module';
import { IdempotencyModule } from '../common/idempotency/idempotency.module';
import { FeatureFlagModule } from '../feature-flags/feature-flag.module';
import { ConnectionsModule } from '../connections/connections.module';

import { OrderRepository } from '../repositories/order.repository';
import { LedgerRepository } from '../repositories/ledger.repository';
import { PeriodLockRepository } from '../repositories/period-lock.repository';
import { ExpenseRepository } from '../repositories/expense.repository';
import { FinancePayoutRepository } from '../repositories/finance-payout.repository';
import { InvoiceRepository } from '../repositories/invoice.repository';
import { TaxNexusRepository } from '../repositories/tax-nexus.repository';
import { FinanceDisputeRepository } from '../repositories/finance-dispute.repository';
import { SubscriptionRepository } from '../repositories/subscription.repository';
import { PlanRepository } from '../repositories/plan.repository';
import { FxRateRepository } from '../repositories/fx-rate.repository';
import { TenantRepository } from '../repositories/tenant.repository';
import { ConnectionRepository } from '../repositories/connection.repository';
import { S3PresignService } from '../common/storage/s3-presign.service';

import { LedgerService } from '../points/ledger.service';
import { FeeDecompositionService } from './fee-decomposition.service';
import { FinancePayoutService } from './finance-payout.service';
import { ExpenseService } from './expense.service';
import { PeriodLockService } from './period-lock.service';
import { PnlService } from './pnl.service';
import { TaxCentreService } from './tax-centre.service';
import { AccountingExportService } from './accounting-export.service';
import { FinanceDisputeService } from './finance-dispute.service';
import { FixedRateFxProvider } from './fx/fixed-rate.provider';
import { FxService } from './fx/fx.service';
import { ZatcaInvoiceService } from './zatca/zatca-invoice.service';
import { ZatcaPdfService } from './zatca/zatca-pdf.service';
import { StripeBillingService } from './billing/stripe-billing.service';
import { AiCreditService } from './billing/ai-credit.service';

import { FinanceController } from './finance.controller';
import { BillingController } from './billing.controller';
import { AdminFinanceController } from './admin-finance.controller';

/**
 * Phase 6 — Finance, Ledger & Tax (implentationplanphase.md tasks 6.1-6.11).
 * Extends the Phase 4.5 `LedgerService`/`LedgerRepository` (declared here as
 * well as in `PointsModule`, same "each module provides what it needs"
 * pattern `OrderRepository` already follows across modules) rather than
 * importing `PointsModule` wholesale — the points-economy-specific providers
 * there (wallet, video watch, fraud, etc.) have nothing to do with Finance.
 */
@Module({
  imports: [AuthModule, RbacModule, AuditLogModule, IdempotencyModule, FeatureFlagModule, ConnectionsModule],
  controllers: [FinanceController, BillingController, AdminFinanceController],
  providers: [
    OrderRepository,
    LedgerRepository,
    PeriodLockRepository,
    ExpenseRepository,
    FinancePayoutRepository,
    InvoiceRepository,
    TaxNexusRepository,
    FinanceDisputeRepository,
    SubscriptionRepository,
    PlanRepository,
    FxRateRepository,
    TenantRepository,
    ConnectionRepository,
    S3PresignService,

    LedgerService,
    FeeDecompositionService,
    FinancePayoutService,
    ExpenseService,
    PeriodLockService,
    PnlService,
    TaxCentreService,
    AccountingExportService,
    FinanceDisputeService,
    FixedRateFxProvider,
    FxService,
    ZatcaInvoiceService,
    ZatcaPdfService,
    StripeBillingService,
    AiCreditService,
  ],
  exports: [LedgerService, FeeDecompositionService, PnlService, FxService],
})
export class FinanceModule {}
