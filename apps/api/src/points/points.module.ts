import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { AuditLogModule } from '../audit/audit-log.module';
import { IdempotencyModule } from '../common/idempotency/idempotency.module';
import { NotificationModule } from '../notifications/notification.module';

import { WalletRepository } from '../repositories/wallet.repository';
import { PointTransactionRepository } from '../repositories/point-transaction.repository';
import { PointEarningRuleRepository } from '../repositories/point-earning-rule.repository';
import { TenantPointSettingsRepository } from '../repositories/tenant-point-settings.repository';
import { VideoContentRepository } from '../repositories/video-content.repository';
import { VideoWatchRepository } from '../repositories/video-watch.repository';
import { ProductPurchaseWithPointsRepository } from '../repositories/product-purchase-with-points.repository';
import { LedgerRepository } from '../repositories/ledger.repository';
import { PeriodLockRepository } from '../repositories/period-lock.repository';
import { TenantRepository } from '../repositories/tenant.repository';
import { ProductRepository } from '../repositories/product.repository';
import { AssetUploadSessionRepository } from '../repositories/asset-upload-session.repository';
import { ResumableUploadStorage } from '../common/storage/resumable-upload.storage';
import { VideoProbeService } from '../studio/video-probe.service';
// Phase 5: RedemptionService now resolves a real Order subtotal when one is
// supplied (docs/DEBT.md 4.5-D6 closed) — this module declares its own
// OrderRepository instance, same "each module provides what it needs"
// pattern ProductRepository above already uses.
import { OrderRepository } from '../repositories/order.repository';

import { WalletService } from './wallet.service';
import { LedgerService } from './ledger.service';
import { EarningRuleService } from './earning-rule.service';
import { FraudService } from './fraud.service';
import { VideoWatchService } from './video-watch.service';
import { VideoContentService } from './video-content.service';
import { RedemptionService } from './redemption.service';
import { ExpiryService } from './expiry.service';
import { PointsQueueService } from './points-queue.service';

import { WalletController } from './wallet.controller';
import { VideoWatchController } from './video-watch.controller';
import { VideoContentController } from './video-content.controller';
import { PointsAdminController } from './points-admin.controller';

/**
 * Phase 4.5 — Points Economy (docs/points-extension.md). Wires the wallet,
 * earning-rule engine, video watch pipeline (+ fraud detection), redemption
 * (+ minimal ledger), expiry scheduler, and their admin surfaces.
 */
@Module({
  imports: [AuthModule, RbacModule, AuditLogModule, IdempotencyModule, NotificationModule],
  controllers: [WalletController, VideoWatchController, VideoContentController, PointsAdminController],
  providers: [
    WalletRepository,
    PointTransactionRepository,
    PointEarningRuleRepository,
    TenantPointSettingsRepository,
    VideoContentRepository,
    VideoWatchRepository,
    ProductPurchaseWithPointsRepository,
    LedgerRepository,
    PeriodLockRepository,
    TenantRepository,
    ProductRepository,
    AssetUploadSessionRepository,
    ResumableUploadStorage,
    VideoProbeService,
    OrderRepository,

    WalletService,
    LedgerService,
    EarningRuleService,
    FraudService,
    VideoWatchService,
    VideoContentService,
    RedemptionService,
    ExpiryService,
    PointsQueueService,
  ],
  exports: [WalletService, EarningRuleService, VideoWatchService, RedemptionService, ExpiryService, LedgerService],
})
export class PointsModule {}
