import { forwardRef, Module } from '@nestjs/common';
import { MfaService } from './mfa.service';
import { MfaController } from './mfa.controller';
import { AuditLogModule } from '../audit/audit-log.module';
import { IdempotencyModule } from '../common/idempotency/idempotency.module';
import { AuthModule } from '../auth/auth.module';

/**
 * `MfaController` needs `AuthService` (getAuthedUser / completeMfaChallenge) and
 * `AuthService` needs `MfaService` (the login MFA gate) — a genuine module-level
 * cycle, resolved the standard NestJS way with `forwardRef()` on both sides (see
 * auth.module.ts's matching forwardRef import of this module).
 */
@Module({
  imports: [AuditLogModule, IdempotencyModule, forwardRef(() => AuthModule)],
  controllers: [MfaController],
  providers: [MfaService],
  exports: [MfaService],
})
export class MfaModule {}
