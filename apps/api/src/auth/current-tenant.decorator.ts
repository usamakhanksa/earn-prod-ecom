import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { TenantContext, TenantScopedRequest } from './tenant-context.guard';

export const CurrentTenant = createParamDecorator((_data: unknown, context: ExecutionContext): TenantContext => {
  const request = context.switchToHttp().getRequest<TenantScopedRequest>();
  return request.tenantContext;
});
