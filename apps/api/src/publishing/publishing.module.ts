import { Module } from '@nestjs/common';
import { ListingsService } from './listings/listings.service';
import { ListingsController } from './listings/listings.controller';
import { DryRunService } from './dry-run.service';
import { PublishInputBuilderService } from './publish-input-builder.service';
import { PublishOrchestratorService } from './publish-orchestrator.service';
import { BulkActionsService } from './bulk-actions.service';
import { BannedTermsService } from './policy/banned-terms.service';
import { BannedTermsController } from './policy/banned-terms.controller';
import { ExportPackGeneratorService } from './export-packs/export-pack-generator.service';
import { ExportPacksController } from './export-packs/export-packs.controller';
import { ExportPackStorage } from './export-packs/export-pack.storage';
import { SyncJobsService } from './sync-jobs/sync-jobs.service';
import { SyncJobsController } from './sync-jobs/sync-jobs.controller';
import { AdminQueuesController } from './sync-jobs/admin-queues.controller';
import { DriftDetectionService } from './drift/drift-detection.service';
import { DriftController } from './drift/drift.controller';
import { SchedulingService } from './scheduling/scheduling.service';

import { ListingRepository } from '../repositories/listing.repository';
import { ListingVariantRepository } from '../repositories/listing-variant.repository';
import { ListingFieldOverrideRepository } from '../repositories/listing-field-override.repository';
import { ListingEventRepository } from '../repositories/listing-event.repository';
import { SyncJobRepository } from '../repositories/sync-job.repository';
import { SyncJobItemRepository } from '../repositories/sync-job-item.repository';
import { ExportPackRepository } from '../repositories/export-pack.repository';
import { ExportPackItemRepository } from '../repositories/export-pack-item.repository';
import { BannedTermRepository } from '../repositories/banned-term.repository';
import { ProductRepository } from '../repositories/product.repository';
import { ProductVariantRepository } from '../repositories/product-variant.repository';
import { AssetRepository } from '../repositories/asset.repository';
import { BlueprintRepository } from '../repositories/blueprint.repository';
import { ConnectionRepository } from '../repositories/connection.repository';
import { ConnectorDefinitionRepository } from '../repositories/connector-definition.repository';
import { MockupRepository } from '../repositories/mockup.repository';
import { ObjectStorageService } from '../common/storage/object-storage.service';

import { AuthModule } from '../auth/auth.module';
import { AuditLogModule } from '../audit/audit-log.module';
import { RbacModule } from '../rbac/rbac.module';
import { IdempotencyModule } from '../common/idempotency/idempotency.module';
import { AdminModule } from '../admin/admin.module';
import { ConnectionsModule } from '../connections/connections.module';
import { ConnectorQueueModule } from '../queue/connector-queue.module';

/**
 * Publishing Pipeline & Export Packs (Phase 4). One module for the whole
 * feature set — the composer, dry-run, orchestrator, bulk actions,
 * approval workflow, IP/trademark linter, Export Pack generator, sync jobs
 * (SSE), drift detection, and the scheduling sweep. Repositories this module
 * needs from OTHER domains (Product/Asset/Blueprint/Connection/
 * ConnectorDefinition/Mockup) are declared as PROVIDERS here directly
 * rather than imported via cross-module `exports` — the same pattern this
 * codebase already uses for `AssetRepository` (provided independently by
 * both `AssetsModule` and `MockupsModule`): these are cheap, stateless
 * wrappers around the single global `PrismaService`, so a second instance
 * costs nothing and avoids a fragile web of module-export dependencies.
 */
@Module({
  imports: [AuthModule, AuditLogModule, RbacModule, IdempotencyModule, AdminModule, ConnectionsModule, ConnectorQueueModule],
  controllers: [ListingsController, SyncJobsController, AdminQueuesController, ExportPacksController, BannedTermsController, DriftController],
  providers: [
    ListingsService,
    DryRunService,
    PublishInputBuilderService,
    PublishOrchestratorService,
    BulkActionsService,
    BannedTermsService,
    ExportPackGeneratorService,
    ExportPackStorage,
    SyncJobsService,
    DriftDetectionService,
    SchedulingService,

    ListingRepository,
    ListingVariantRepository,
    ListingFieldOverrideRepository,
    ListingEventRepository,
    SyncJobRepository,
    SyncJobItemRepository,
    ExportPackRepository,
    ExportPackItemRepository,
    BannedTermRepository,
    ProductRepository,
    ProductVariantRepository,
    AssetRepository,
    BlueprintRepository,
    ConnectionRepository,
    ConnectorDefinitionRepository,
    MockupRepository,
    ObjectStorageService,
  ],
  exports: [ListingsService, PublishOrchestratorService, BulkActionsService, SchedulingService, BannedTermsService, ListingRepository],
})
export class PublishingModule {}
