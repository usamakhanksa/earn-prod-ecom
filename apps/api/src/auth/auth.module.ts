import { forwardRef, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { TenantContextGuard } from './tenant-context.guard';
import { MailerModule } from '../mailer/mailer.module';
import { MfaModule } from '../mfa/mfa.module';
import { env } from '../config/env';

// AuthService needs MfaService (MFA login gate); MfaController needs AuthService
// (getAuthedUser / completeMfaChallenge) — a genuine module-level cycle, resolved
// the standard NestJS way with forwardRef() on both sides (see mfa.module.ts).
@Module({
  imports: [
    MailerModule,
    forwardRef(() => MfaModule),
    JwtModule.register({
      global: true,
      secret: env.JWT_ACCESS_SECRET,
      signOptions: { expiresIn: '15m' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, TenantContextGuard],
  exports: [AuthService, JwtAuthGuard, TenantContextGuard],
})
export class AuthModule {}
