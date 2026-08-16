import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { ProductRepository } from '../../repositories/product.repository';
import { ProductVariantRepository } from '../../repositories/product-variant.repository';
import { BlueprintRepository } from '../../repositories/blueprint.repository';
import { DesignPlacementRepository } from '../../repositories/design-placement.repository';
import { ListingRepository } from '../../repositories/listing.repository';
import { AuditLogModule } from '../../audit/audit-log.module';
import { AuthModule } from '../../auth/auth.module';
import { RbacModule } from '../../rbac/rbac.module';
import { IdempotencyModule } from '../../common/idempotency/idempotency.module';

@Module({
  imports: [AuditLogModule, AuthModule, RbacModule, IdempotencyModule],
  controllers: [ProductsController],
  providers: [ProductsService, ProductRepository, ProductVariantRepository, BlueprintRepository, DesignPlacementRepository, ListingRepository],
  exports: [ProductsService, ProductRepository, ProductVariantRepository],
})
export class ProductsModule {}
