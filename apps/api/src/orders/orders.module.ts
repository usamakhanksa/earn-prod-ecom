import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { AuditLogModule } from '../audit/audit-log.module';
import { IdempotencyModule } from '../common/idempotency/idempotency.module';
import { NotificationModule } from '../notifications/notification.module';
import { ConnectionsModule } from '../connections/connections.module';
import { AdminModule } from '../admin/admin.module';
import { PointsModule } from '../points/points.module';
import { DigitalModule } from '../digital/digital.module';

import { OrderRepository } from '../repositories/order.repository';
import { OrderIngestionRepository } from '../repositories/order-ingestion.repository';
import { OrderExceptionRepository } from '../repositories/order-exception.repository';
import { FulfilmentRepository } from '../repositories/fulfilment.repository';
import { ShipmentRepository } from '../repositories/shipment.repository';
import { ReturnsRefundsRepository } from '../repositories/returns-refunds.repository';
import { SavedOrderViewRepository } from '../repositories/saved-order-view.repository';
import { BuyerMessageRepository } from '../repositories/buyer-message.repository';
import { ProductPurchaseWithPointsRepository } from '../repositories/product-purchase-with-points.repository';
import { MembershipRepository } from '../repositories/membership.repository';
import { ConnectionRepository } from '../repositories/connection.repository';
import { ConnectorDefinitionRepository } from '../repositories/connector-definition.repository';
import { TenantRepository } from '../repositories/tenant.repository';

import { OrdersService } from './orders.service';
import { OrderIngestionService } from './order-ingestion.service';
import { FulfilmentService } from './fulfilment.service';
import { ShipmentService } from './shipment.service';
import { OrderExceptionService } from './order-exception.service';
import { ReturnsRefundsService } from './returns-refunds.service';
import { BuyerMessageService } from './buyer-message.service';
import { PackingSlipService } from './packing-slip.service';

import { OrdersController } from './orders.controller';
import { OrderWebhooksController } from './order-webhooks.controller';
import { AdminOrderExceptionsController } from './admin-order-exceptions.controller';

/**
 * Orders, Fulfilment & Digital Delivery (Phase 5 / featureslist.md §6,
 * implentationplanphase.md tasks 5.1-5.9). Imports `PointsModule` for the
 * real redemption-refund wiring (`RedemptionService`) and `DigitalModule`
 * for the manual-order entitlement auto-grant (`EntitlementService`) — see
 * `OrdersService`'s doc comments on both call sites.
 */
@Module({
  imports: [AuthModule, RbacModule, AuditLogModule, IdempotencyModule, NotificationModule, ConnectionsModule, AdminModule, PointsModule, DigitalModule],
  controllers: [OrdersController, OrderWebhooksController, AdminOrderExceptionsController],
  providers: [
    OrderRepository,
    OrderIngestionRepository,
    OrderExceptionRepository,
    FulfilmentRepository,
    ShipmentRepository,
    ReturnsRefundsRepository,
    SavedOrderViewRepository,
    BuyerMessageRepository,
    ProductPurchaseWithPointsRepository,
    MembershipRepository,
    ConnectionRepository,
    ConnectorDefinitionRepository,
    TenantRepository,

    OrdersService,
    OrderIngestionService,
    FulfilmentService,
    ShipmentService,
    OrderExceptionService,
    ReturnsRefundsService,
    BuyerMessageService,
    PackingSlipService,
  ],
  exports: [OrdersService, OrderIngestionService],
})
export class OrdersModule {}
