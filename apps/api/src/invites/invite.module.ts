import { Module } from '@nestjs/common';
import { InviteService } from './invite.service';
import { TenantInvitesController, InviteAcceptController } from './invite.controller';
import { InviteRepository } from '../repositories/invite.repository';
import { MembershipRepository } from '../repositories/membership.repository';
import { MailerModule } from '../mailer/mailer.module';
import { AuditLogModule } from '../audit/audit-log.module';
import { NotificationModule } from '../notifications/notification.module';
import { RbacModule } from '../rbac/rbac.module';
import { IdempotencyModule } from '../common/idempotency/idempotency.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [MailerModule, AuditLogModule, NotificationModule, RbacModule, IdempotencyModule, AuthModule],
  controllers: [TenantInvitesController, InviteAcceptController],
  providers: [InviteService, InviteRepository, MembershipRepository],
  exports: [InviteService],
})
export class InviteModule {}
