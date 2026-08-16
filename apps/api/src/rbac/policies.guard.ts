import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { OrgRole } from '@omnisell/shared';
import { AbilityFactory } from './ability.factory';
import { CHECK_POLICIES_KEY, type PolicyHandler } from './check-policies.decorator';
import type { TenantScopedRequest } from '../auth/tenant-context.guard';

/**
 * Enforces `@CheckPolicies(...)` handlers against the caller's role-derived CASL
 * ability. Must run after TenantContextGuard (needs `req.tenantContext.role`).
 * No handlers on a route means no additional restriction beyond authentication.
 */
@Injectable()
export class PoliciesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly abilityFactory: AbilityFactory,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const handlers = this.reflector.get<PolicyHandler[]>(CHECK_POLICIES_KEY, context.getHandler()) ?? [];
    if (handlers.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<TenantScopedRequest>();
    const ability = this.abilityFactory.createForRole(request.tenantContext.role as OrgRole);

    const allowed = handlers.every((handler) => handler(ability));
    if (!allowed) {
      throw new ForbiddenException('Insufficient permissions for this action');
    }
    return true;
  }
}
