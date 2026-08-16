import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { AuthService, type AuthTokens, type DeviceInfo, type LoginResult, type SessionSummary } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUserId } from './current-user.decorator';
import { SkipAuditLog } from '../audit/skip-audit-log.decorator';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  deviceId: z.string().optional(),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).optional(),
  orgName: z.string().min(1),
  deviceId: z.string().optional(),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
  deviceId: z.string().optional(),
});

const verifyEmailSchema = z.object({
  token: z.string().min(1),
});

const requestPasswordResetSchema = z.object({
  email: z.string().email(),
});

const confirmPasswordResetSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8),
});

function deviceFromRequest(request: Request, deviceId?: string): DeviceInfo {
  return {
    ...(deviceId !== undefined ? { deviceId } : {}),
    ...(request.ip !== undefined ? { ipAddress: request.ip } : {}),
    ...(request.headers['user-agent'] !== undefined ? { userAgent: request.headers['user-agent'] } : {}),
  };
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @SkipAuditLog() // AuthService writes a precise `user.register` row itself
  async register(@Body() body: unknown, @Req() request: Request): Promise<AuthTokens> {
    const input = registerSchema.parse(body);
    return this.auth.register(input, deviceFromRequest(request, input.deviceId));
  }

  @Post('login')
  async login(@Body() body: unknown, @Req() request: Request): Promise<LoginResult> {
    const input = loginSchema.parse(body);
    return this.auth.login(input.email, input.password, deviceFromRequest(request, input.deviceId));
  }

  @Post('refresh')
  async refresh(@Body() body: unknown, @Req() request: Request): Promise<AuthTokens> {
    const input = refreshSchema.parse(body);
    return this.auth.refresh(input.refreshToken, deviceFromRequest(request, input.deviceId));
  }

  @Post('verify-email')
  async verifyEmail(@Body() body: unknown): Promise<{ verified: true }> {
    const input = verifyEmailSchema.parse(body);
    await this.auth.verifyEmail(input.token);
    return { verified: true };
  }

  @Post('password-reset/request')
  async requestPasswordReset(@Body() body: unknown): Promise<{ requested: true }> {
    const input = requestPasswordResetSchema.parse(body);
    await this.auth.requestPasswordReset(input.email);
    return { requested: true };
  }

  @Post('password-reset/confirm')
  @SkipAuditLog() // AuthService writes a precise `user.password_reset` row itself
  async confirmPasswordReset(@Body() body: unknown): Promise<{ reset: true }> {
    const input = confirmPasswordResetSchema.parse(body);
    await this.auth.confirmPasswordReset(input.token, input.newPassword);
    return { reset: true };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUserId() userId: string) {
    return this.auth.getAuthedUser(userId);
  }

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  async sessions(@CurrentUserId() userId: string): Promise<SessionSummary[]> {
    return this.auth.listSessions(userId);
  }

  @Delete('sessions/:id')
  @UseGuards(JwtAuthGuard)
  async revokeSession(@CurrentUserId() userId: string, @Param('id') sessionId: string): Promise<{ revoked: true }> {
    await this.auth.revokeSession(userId, sessionId);
    return { revoked: true };
  }
}
