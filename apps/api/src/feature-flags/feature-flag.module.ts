import { Module } from '@nestjs/common';
import { FeatureFlagService } from './feature-flag.service';
import { FeatureFlagController } from './feature-flag.controller';
import { FeatureFlagTargetRepository } from '../repositories/feature-flag-target.repository';
import { AuditLogModule } from '../audit/audit-log.module';
import { AdminModule } from '../admin/admin.module';
import { RbacModule } from '../rbac/rbac.module';
import { IdempotencyModule } from '../common/idempotency/idempotency.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuditLogModule, AdminModule, RbacModule, IdempotencyModule, AuthModule],
  controllers: [FeatureFlagController],
  providers: [FeatureFlagService, FeatureFlagTargetRepository],
  exports: [FeatureFlagService],
})
export class FeatureFlagModule {}
