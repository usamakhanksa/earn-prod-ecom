import { Module } from '@nestjs/common';
import { PricingService } from './pricing.service';
import { PricingController } from './pricing.controller';
import { PricingRuleRepository } from '../../repositories/pricing-rule.repository';
import { AuditLogModule } from '../../audit/audit-log.module';
import { AuthModule } from '../../auth/auth.module';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [AuditLogModule, AuthModule, RbacModule],
  controllers: [PricingController],
  providers: [PricingService, PricingRuleRepository],
  exports: [PricingService],
})
export class PricingModule {}
