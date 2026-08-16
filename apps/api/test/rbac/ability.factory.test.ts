import { describe, expect, it } from 'vitest';
import { AbilityFactory } from '../../src/rbac/ability.factory';

describe('AbilityFactory', () => {
  const factory = new AbilityFactory();

  it('grants OWNER unrestricted management', () => {
    const ability = factory.createForRole('OWNER');
    expect(ability.can('manage', 'Tenant')).toBe(true);
    expect(ability.can('delete', 'Tenant')).toBe(true);
    expect(ability.can('manage', 'ApiKey')).toBe(true);
  });

  it('lets ADMIN manage everything except deleting the Tenant', () => {
    const ability = factory.createForRole('ADMIN');
    expect(ability.can('manage', 'ApiKey')).toBe(true);
    expect(ability.can('update', 'Tenant')).toBe(true);
    expect(ability.can('delete', 'Tenant')).toBe(false);
  });

  it('lets DESIGNER read everything and write Product/VideoContent/Studio+Catalog resources', () => {
    const ability = factory.createForRole('DESIGNER');
    expect(ability.can('read', 'Wallet')).toBe(true);
    expect(ability.can('create', 'Product')).toBe(true);
    expect(ability.can('create', 'Asset')).toBe(true);
    expect(ability.can('update', 'DesignPlacement')).toBe(true);
    expect(ability.can('delete', 'Asset')).toBe(true);
    expect(ability.can('create', 'ApiKey')).toBe(false);
    expect(ability.can('create', 'PricingRule')).toBe(false);
  });

  it('lets FINANCE read broadly, manage PricingRule, but not identity/tenancy', () => {
    const ability = factory.createForRole('FINANCE');
    expect(ability.can('read', 'Wallet')).toBe(true);
    expect(ability.can('update', 'PointEarningRule')).toBe(true);
    expect(ability.can('create', 'PricingRule')).toBe(true);
    expect(ability.can('manage', 'Membership')).toBe(false);
    expect(ability.can('delete', 'Product')).toBe(false);
    expect(ability.can('create', 'Asset')).toBe(false);
  });

  it('restricts ANALYST to read-only', () => {
    const ability = factory.createForRole('ANALYST');
    expect(ability.can('read', 'AuditLog')).toBe(true);
    expect(ability.can('update', 'PointEarningRule')).toBe(false);
    expect(ability.can('create', 'Product')).toBe(false);
  });

  it('lets SUPPORT read support surfaces and adjust points, nothing else', () => {
    const ability = factory.createForRole('SUPPORT');
    expect(ability.can('read', 'Wallet')).toBe(true);
    expect(ability.can('update', 'PointTransaction')).toBe(true);
    expect(ability.can('manage', 'ApiKey')).toBe(false);
    expect(ability.can('read', 'ApiKey')).toBe(false);
  });

  it('restricts MEMBER (consumer mode) to reading catalog + content only', () => {
    const ability = factory.createForRole('MEMBER');
    expect(ability.can('read', 'Product')).toBe(true);
    expect(ability.can('read', 'VideoContent')).toBe(true);
    expect(ability.can('read', 'Wallet')).toBe(false);
    expect(ability.can('manage', 'Tenant')).toBe(false);
  });

  // Phase 3 — Connector Framework subjects (apps/api/src/rbac/subjects.ts).
  // Connecting a channel touches encrypted credentials, so only OWNER/ADMIN
  // ("manage all") can create/rotate/disconnect — everyone else gets the
  // same broad read access they already have to everything else, and MEMBER
  // (consumer mode) gets neither.
  it('lets OWNER/ADMIN manage Connection/Credential/ConnectorDefinition; read-only for DESIGNER/FINANCE/ANALYST', () => {
    expect(factory.createForRole('OWNER').can('manage', 'Connection')).toBe(true);
    expect(factory.createForRole('ADMIN').can('create', 'Connection')).toBe(true);
    expect(factory.createForRole('DESIGNER').can('read', 'Connection')).toBe(true);
    expect(factory.createForRole('DESIGNER').can('create', 'Connection')).toBe(false);
    expect(factory.createForRole('FINANCE').can('read', 'ConnectorDefinition')).toBe(true);
    expect(factory.createForRole('ANALYST').can('read', 'Credential')).toBe(true);
    expect(factory.createForRole('ANALYST').can('delete', 'Connection')).toBe(false);
  });

  it('never lets MEMBER (consumer mode) see connector/credential data', () => {
    const ability = factory.createForRole('MEMBER');
    expect(ability.can('read', 'Connection')).toBe(false);
    expect(ability.can('read', 'Credential')).toBe(false);
    expect(ability.can('read', 'ConnectorDefinition')).toBe(false);
  });
});
