import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { IdempotencyModule } from '../common/idempotency/idempotency.module';

import { DigitalProductRepository } from '../repositories/digital-product.repository';
import { EntitlementRepository } from '../repositories/entitlement.repository';
import { DeliveryRepository } from '../repositories/delivery.repository';
import { LicenceKeyRepository } from '../repositories/licence-key.repository';
import { CouponRepository } from '../repositories/coupon.repository';
import { S3PresignService } from '../common/storage/s3-presign.service';

import { DigitalProductService } from './digital-product.service';
import { EntitlementService } from './entitlement.service';
import { DeliveryService } from './delivery.service';
import { LicenceKeyService } from './licence-key.service';
import { CouponService } from './coupon.service';

import { DigitalController } from './digital.controller';
import { DeliveriesController } from './deliveries.controller';

/** Digital Products (Phase 5 / featureslist.md §7, tasks 5.10-5.11). */
@Module({
  imports: [AuthModule, RbacModule, IdempotencyModule],
  controllers: [DigitalController, DeliveriesController],
  providers: [
    DigitalProductRepository,
    EntitlementRepository,
    DeliveryRepository,
    LicenceKeyRepository,
    CouponRepository,
    S3PresignService,
    DigitalProductService,
    EntitlementService,
    DeliveryService,
    LicenceKeyService,
    CouponService,
  ],
  exports: [EntitlementService, DigitalProductService, DeliveryService],
})
export class DigitalModule {}
