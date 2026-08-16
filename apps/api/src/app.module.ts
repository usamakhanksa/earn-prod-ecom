import { Module, type NestModule, type MiddlewareConsumer } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import type { Options as PinoHttpOptions } from 'pino-http';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { OAuthModule } from './oauth/oauth.module';
import { RbacModule } from './rbac/rbac.module';
import { AuditLogModule } from './audit/audit-log.module';
import { AdminModule } from './admin/admin.module';
import { FeatureFlagModule } from './feature-flags/feature-flag.module';
import { NotificationModule } from './notifications/notification.module';
import { InviteModule } from './invites/invite.module';
import { TenantsModule } from './tenants/tenants.module';
import { AssetsModule } from './studio/assets/assets.module';
import { MockupsModule } from './studio/mockups/mockups.module';
import { BlueprintsModule } from './catalog/blueprints/blueprints.module';
import { ProductsModule } from './catalog/products/products.module';
import { PlacementsModule } from './catalog/placements/placements.module';
import { PricingModule } from './catalog/pricing/pricing.module';
import { VaultModule } from './vault/vault.module';
import { ConnectorsModule } from './connectors/connectors.module';
import { ConnectionsModule } from './connections/connections.module';
import { ConnectorQueueModule } from './queue/connector-queue.module';
import { TokenRefreshModule } from './token-refresh/token-refresh.module';
import { PublishingModule } from './publishing/publishing.module';
import { MarketplaceModule } from './marketplace/marketplace.module';
import { PointsModule } from './points/points.module';
import { DigitalModule } from './digital/digital.module';
import { OrdersModule } from './orders/orders.module';
import { FinanceModule } from './finance/finance.module';
import { WalletRepository } from './repositories/wallet.repository';
import { MembershipRepository } from './repositories/membership.repository';
import { UserRepository } from './repositories/user.repository';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { env } from './config/env';

const pinoHttp: PinoHttpOptions = {
  level: env.LOG_LEVEL,
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', 'req.headers["x-api-key"]'],
    censor: '[REDACTED]',
  },
  genReqId: (req: IncomingMessage) => (req.headers['x-request-id'] as string) ?? randomUUID(),
  ...(env.NODE_ENV === 'development'
    ? { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } } }
    : {}),
};

@Module({
  imports: [
    LoggerModule.forRoot({ pinoHttp }),
    PrismaModule,
    HealthModule,
    AuthModule,
    OAuthModule,
    RbacModule,
    AuditLogModule,
    AdminModule,
    FeatureFlagModule,
    NotificationModule,
    InviteModule,
    TenantsModule,
    AssetsModule,
    MockupsModule,
    BlueprintsModule,
    ProductsModule,
    PlacementsModule,
    PricingModule,
    VaultModule,
    ConnectorsModule,
    ConnectionsModule,
    ConnectorQueueModule,
    TokenRefreshModule,
    PublishingModule,
    MarketplaceModule,
    PointsModule,
    DigitalModule,
    OrdersModule,
    FinanceModule,
  ],
  providers: [WalletRepository, MembershipRepository, UserRepository],
  exports: [WalletRepository, MembershipRepository, UserRepository],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}