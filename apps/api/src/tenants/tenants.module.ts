import { Module } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { TenantsController, MembersController } from './tenants.controller';
import { TenantRepository } from '../repositories/tenant.repository';
import { MembershipRepository } from '../repositories/membership.repository';
import { UserRepository } from '../repositories/user.repository';
import { AuditLogModule } from '../audit/audit-log.module';
import { RbacModule } from '../rbac/rbac.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuditLogModule, RbacModule, AuthModule],
  controllers: [TenantsController, MembersController],
  providers: [TenantsService, TenantRepository, MembershipRepository, UserRepository],
  exports: [TenantsService],
})
export class TenantsModule {}
