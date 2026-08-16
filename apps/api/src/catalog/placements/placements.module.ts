import { Module } from '@nestjs/common';
import { PlacementsService } from './placements.service';
import { PlacementsController } from './placements.controller';
import { DesignPlacementRepository } from '../../repositories/design-placement.repository';
import { ProductRepository } from '../../repositories/product.repository';
import { AuditLogModule } from '../../audit/audit-log.module';
import { AuthModule } from '../../auth/auth.module';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [AuditLogModule, AuthModule, RbacModule],
  controllers: [PlacementsController],
  providers: [PlacementsService, DesignPlacementRepository, ProductRepository],
  exports: [PlacementsService],
})
export class PlacementsModule {}
