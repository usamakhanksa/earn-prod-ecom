import { Module } from '@nestjs/common';
import { BlueprintsService } from './blueprints.service';
import { BlueprintSyncService } from './blueprint-sync.service';
import { BlueprintsController } from './blueprints.controller';
import { BlueprintRepository } from '../../repositories/blueprint.repository';
import { ConnectionRepository } from '../../repositories/connection.repository';
import { AuthModule } from '../../auth/auth.module';
import { ConnectionsModule } from '../../connections/connections.module';
import { AuditLogModule } from '../../audit/audit-log.module';
import { IdempotencyModule } from '../../common/idempotency/idempotency.module';

@Module({
  imports: [AuthModule, ConnectionsModule, AuditLogModule, IdempotencyModule],
  controllers: [BlueprintsController],
  providers: [BlueprintsService, BlueprintSyncService, BlueprintRepository, ConnectionRepository],
  exports: [BlueprintsService],
})
export class BlueprintsModule {}
