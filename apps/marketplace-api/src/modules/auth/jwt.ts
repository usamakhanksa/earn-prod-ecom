import jwt from 'jsonwebtoken';
import type { Role } from '@marketplace/shared';
import { env } from '../../env.js';

/**
 * Auth strategy choice: JWT (not server-side sessions). Documented
 * reasoning: marketplace-web (cookie), marketplace-mobile (Authorization
 * header, no cookie jar) and future marketplace-admin all need to
 * authenticate against the same stateless API without a shared session
 * store — a signed JWT works identically for all three. Single
 * long-lived (7 day) access token for Phase 1 simplicity; refresh-token
 * rotation and revocation lists are deferred (see docs/marketplace/DEBT.md).
 */
const TOKEN_TTL = '7d';

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: TOKEN_TTL });
}

export function verifyToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET);
  if (
    typeof decoded !== 'object' ||
    decoded === null ||
    typeof (decoded as Record<string, unknown>).sub !== 'string' ||
    typeof (decoded as Record<string, unknown>).email !== 'string' ||
    typeof (decoded as Record<string, unknown>).role !== 'string'
  ) {
    throw new Error('Malformed JWT payload');
  }
  const { sub, email, role } = decoded as { sub: string; email: string; role: string };
  return { sub, email, role: role as Role };
}

export const AUTH_COOKIE_NAME = 'marketplace_token';
