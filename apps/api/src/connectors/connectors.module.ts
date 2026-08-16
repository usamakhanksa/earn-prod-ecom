import { Module } from '@nestjs/common';
import { ConnectorsService } from './connectors.service';
import { ConnectorsController } from './connectors.controller';
import { ConnectorDefinitionRepository } from '../repositories/connector-definition.repository';
import { AuditLogModule } from '../audit/audit-log.module';
import { AuthModule } from '../auth/auth.module';
import { IdempotencyModule } from '../common/idempotency/idempotency.module';
import { AdminModule } from '../admin/admin.module';

@Module({
  imports: [AuthModule, AuditLogModule, IdempotencyModule, AdminModule],
  controllers: [ConnectorsController],
  providers: [ConnectorsService, ConnectorDefinitionRepository],
  exports: [ConnectorsService, ConnectorDefinitionRepository],
})
export class ConnectorsModule {}
