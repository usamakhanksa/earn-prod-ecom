import { Module } from '@nestjs/common';
import { AdminOnlyGuard } from './admin-only.guard';
import { AdminService } from './admin.service';

@Module({
  providers: [AdminOnlyGuard, AdminService],
  exports: [AdminOnlyGuard, AdminService],
})
export class AdminModule {}
