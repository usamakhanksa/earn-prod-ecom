import { Module } from '@nestjs/common';
import { ConnectionsService } from './connections.service';
import { ConnectionsController } from './connections.controller';
import { ConnectorOAuthCallbackController } from './connector-oauth-callback.controller';
import { AdapterRunnerService } from './adapter-runner.service';
import { ConnectionRepository } from '../repositories/connection.repository';
import { CredentialRepository } from '../repositories/credential.repository';
import { ConnectorDefinitionRepository } from '../repositories/connector-definition.repository';
import { ConnectorOAuthStateRepository } from '../repositories/connector-oauth-state.repository';
import { ConnectionHealthSampleRepository } from '../repositories/connection-health-sample.repository';
import { VaultModule } from '../vault/vault.module';
import { AuditLogModule } from '../audit/audit-log.module';
import { AuthModule } from '../auth/auth.module';
import { IdempotencyModule } from '../common/idempotency/idempotency.module';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [AuthModule, AuditLogModule, VaultModule, IdempotencyModule, RbacModule],
  controllers: [ConnectionsController, ConnectorOAuthCallbackController],
  providers: [
    ConnectionsService,
    AdapterRunnerService,
    ConnectionRepository,
    CredentialRepository,
    ConnectorDefinitionRepository,
    ConnectorOAuthStateRepository,
    ConnectionHealthSampleRepository,
  ],
  exports: [ConnectionsService, AdapterRunnerService],
})
export class ConnectionsModule {}
