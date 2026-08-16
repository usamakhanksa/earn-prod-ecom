import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { AuthService } from './auth.service';
import type { AuthenticatedRequest } from './jwt-auth.guard';

export interface TenantContext {
  userId: string;
  tenantId: string;
  role: string;
}

export interface TenantScopedRequest extends AuthenticatedRequest {
  tenantContext: TenantContext;
}

/**
 * Resolves the active tenant + role for the authenticated caller (Phase 1.4/1.6).
 * Must run after JwtAuthGuard. Honours an optional `x-tenant-id` header so a future
 * org switcher can request a specific membership; falls back to the caller's
 * earliest active membership otherwise (single-tenant conservative default).
 */
@Injectable()
export class TenantContextGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<TenantScopedRequest>();
    const requestedTenantId = request.headers['x-tenant-id'];
    const tenantContext = await this.auth.resolveContext(
      request.user.userId,
      typeof requestedTenantId === 'string' ? requestedTenantId : undefined,
    );
    request.tenantContext = tenantContext;
    return true;
  }
}
