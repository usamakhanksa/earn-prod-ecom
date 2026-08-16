import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { AbilityFactory } from '../../src/rbac/ability.factory';
import { PoliciesGuard } from '../../src/rbac/policies.guard';

function makeContext(role: string, handlers: unknown[]) {
  const reflector = { get: vi.fn().mockReturnValue(handlers) } as unknown as Reflector;
  const guard = new PoliciesGuard(reflector, new AbilityFactory());
  const request = { tenantContext: { userId: 'u1', tenantId: 't1', role } };
  const context = {
    getHandler: () => ({}),
    switchToHttp: () => ({ getRequest: () => request }),
  };
  return { guard, context };
}

describe('PoliciesGuard', () => {
  it('allows a route with no policy handlers', () => {
    const { guard, context } = makeContext('MEMBER', []);
    expect(guard.canActivate(context as never)).toBe(true);
  });

  it('allows a role whose ability satisfies every handler', () => {
    const { guard, context } = makeContext('OWNER', [(ability: { can: (a: string, s: string) => boolean }) => ability.can('manage', 'ApiKey')]);
    expect(guard.canActivate(context as never)).toBe(true);
  });

  it('rejects a role whose ability fails a handler', () => {
    const { guard, context } = makeContext('MEMBER', [(ability: { can: (a: string, s: string) => boolean }) => ability.can('manage', 'ApiKey')]);
    expect(() => guard.canActivate(context as never)).toThrow(ForbiddenException);
  });
});
