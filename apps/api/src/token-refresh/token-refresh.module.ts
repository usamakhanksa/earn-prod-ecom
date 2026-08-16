import { Module } from '@nestjs/common';
import { TokenRefreshService } from './token-refresh.service';
import { CredentialRepository } from '../repositories/credential.repository';
import { ConnectionRepository } from '../repositories/connection.repository';
import { VaultModule } from '../vault/vault.module';
import { NotificationModule } from '../notifications/notification.module';
import { AuditLogModule } from '../audit/audit-log.module';

@Module({
  imports: [VaultModule, NotificationModule, AuditLogModule],
  providers: [TokenRefreshService, CredentialRepository, ConnectionRepository],
  exports: [TokenRefreshService],
})
export class TokenRefreshModule {}
