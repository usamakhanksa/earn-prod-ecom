import { Module } from '@nestjs/common';
import { AssetsService } from './assets.service';
import { AssetsController } from './assets.controller';
import { AssetRepository } from '../../repositories/asset.repository';
import { AssetVersionRepository } from '../../repositories/asset-version.repository';
import { AssetUploadSessionRepository } from '../../repositories/asset-upload-session.repository';
import { PreflightReportRepository } from '../../repositories/preflight-report.repository';
import { FolderRepository } from '../../repositories/folder.repository';
import { CollectionRepository } from '../../repositories/collection.repository';
import { BlueprintRepository } from '../../repositories/blueprint.repository';
import { S3PresignService } from '../../common/storage/s3-presign.service';
import { ResumableUploadStorage } from '../../common/storage/resumable-upload.storage';
import { ThumbnailService } from '../../common/storage/thumbnail.service';
import { VirusScanService } from '../../common/storage/virus-scan.service';
import { PreflightService } from '../preflight/preflight.service';
import { AuditLogModule } from '../../audit/audit-log.module';
import { AuthModule } from '../../auth/auth.module';
import { RbacModule } from '../../rbac/rbac.module';
import { IdempotencyModule } from '../../common/idempotency/idempotency.module';

@Module({
  imports: [AuditLogModule, AuthModule, RbacModule, IdempotencyModule],
  controllers: [AssetsController],
  providers: [
    AssetsService,
    AssetRepository,
    AssetVersionRepository,
    AssetUploadSessionRepository,
    PreflightReportRepository,
    FolderRepository,
    CollectionRepository,
    BlueprintRepository,
    S3PresignService,
    ResumableUploadStorage,
    ThumbnailService,
    VirusScanService,
    PreflightService,
  ],
  exports: [AssetsService, AssetRepository, PreflightReportRepository, BlueprintRepository],
})
export class AssetsModule {}
