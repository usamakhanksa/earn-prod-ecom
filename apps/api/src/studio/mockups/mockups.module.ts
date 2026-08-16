import { Module } from '@nestjs/common';
import { MockupsService } from './mockups.service';
import { MockupsController } from './mockups.controller';
import { MockupComposeService } from './mockup-compose.service';
import { MockupRepository } from '../../repositories/mockup.repository';
import { AssetRepository } from '../../repositories/asset.repository';
import { ObjectStorageService } from '../../common/storage/object-storage.service';
import { AuditLogModule } from '../../audit/audit-log.module';
import { AuthModule } from '../../auth/auth.module';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [AuditLogModule, AuthModule, RbacModule],
  controllers: [MockupsController],
  providers: [MockupsService, MockupComposeService, MockupRepository, AssetRepository, ObjectStorageService],
  exports: [MockupsService],
})
export class MockupsModule {}
