import { Body, Controller, Headers, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { mfaChallengeSchema, mfaVerifySchema } from '@omnisell/shared';
import { MfaService, type MfaSetupResult, type MfaVerifyResult } from './mfa.service';
import { AuthService, type AuthTokens, type DeviceInfo } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUserId } from '../auth/current-user.decorator';
import { SkipAuditLog } from '../audit/skip-audit-log.decorator';
import { IdempotencyService } from '../common/idempotency/idempotency.service';

function deviceFromRequest(request: Request, deviceId?: string): DeviceInfo {
  return {
    ...(deviceId !== undefined ? { deviceId } : {}),
    ...(request.ip !== undefined ? { ipAddress: request.ip } : {}),
    ...(request.headers['user-agent'] !== undefined ? { userAgent: request.headers['user-agent'] } : {}),
  };
}

@Controller('auth/mfa')
export class MfaController {
  constructor(
    private readonly mfa: MfaService,
    private readonly auth: AuthService,
    private readonly idempotency: IdempotencyService,
  ) {}

  /** Generates (but does not yet activate) a TOTP secret for the authenticated user. */
  @Post('setup')
  @UseGuards(JwtAuthGuard)
  @SkipAuditLog() // no state change yet — verify() is the mutation that matters
  async setup(@CurrentUserId() userId: string): Promise<MfaSetupResult> {
    const user = await this.auth.getAuthedUser(userId);
    if (user === null) {
      throw new UnauthorizedException('Account not found');
    }
    return this.mfa.setup(userId, user.email);
  }

  /** Activates MFA and issues the one-time-visible recovery codes. */
  @Post('verify')
  @UseGuards(JwtAuthGuard)
  @SkipAuditLog() // MfaService.verifyAndActivate writes a precise `mfa.enabled` row itself
  async verify(
    @CurrentUserId() userId: string,
    @Body() body: unknown,
    @Req() request: Request,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<MfaVerifyResult> {
    const input = mfaVerifySchema.parse(body);
    // Idempotent by design (prompt.md constraint #5): a retried "verify" with the
    // same key + code must not mint a second batch of recovery codes.
    const result = await this.idempotency.run(
      { scope: 'mfa.verify', key: idempotencyKey, ownerId: userId, requestBody: input },
      async () => ({ status: 200, body: await this.mfa.verifyAndActivate(userId, input.code, request.ip) }),
    );
    return result.body;
  }

  /** Step 2 of MFA login: exchange a challenge token + TOTP/recovery code for tokens. */
  @Post('challenge')
  async challenge(@Body() body: unknown, @Req() request: Request): Promise<AuthTokens> {
    const input = mfaChallengeSchema.parse(body);
    return this.auth.completeMfaChallenge(input.challengeToken, input.code, deviceFromRequest(request, input.deviceId));
  }

  @Post('disable')
  @UseGuards(JwtAuthGuard)
  @SkipAuditLog() // MfaService.disable writes a precise `mfa.disabled` row itself
  async disable(@CurrentUserId() userId: string, @Req() request: Request): Promise<{ disabled: true }> {
    await this.mfa.disable(userId, request.ip);
    return { disabled: true };
  }
}
