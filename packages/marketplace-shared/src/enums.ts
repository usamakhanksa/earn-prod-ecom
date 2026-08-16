/**
 * Domain enums shared across marketplace-api, marketplace-web,
 * marketplace-admin (route group) and marketplace-mobile.
 *
 * Mirrors the `Role` enum in apps/marketplace-api/prisma/schema.prisma —
 * keep the two in sync by hand for now (Phase 1: no code generation from
 * Prisma enums into this package yet, see docs/marketplace/DEBT.md).
 */
export const ROLES = [
  'USER',
  'SUPPLIER',
  'AFFILIATE',
  'ADMIN',
  'SUPER_ADMIN',
  'SUPPORT',
  'FINANCE',
] as const;

export type Role = (typeof ROLES)[number];

export const isRole = (value: string): value is Role => (ROLES as readonly string[]).includes(value);
