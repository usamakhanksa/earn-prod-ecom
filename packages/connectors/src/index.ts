/**
 * `@omnisell/connectors` — the Connector SDK (prompt.md "CONNECTOR SDK" section /
 * implentationplanphase.md Phase 3). Pure TypeScript: no Prisma, no NestJS, no
 * DB access — `apps/api` is the only consumer that touches persistence, wiring
 * decrypted credentials into a `Ctx` and calling into an adapter from here.
 */
export * from './types';
export * from './adapter';
export * from './error-mapper';
export * from './rate-limiter';
export * from './http';
export * from './vault';
export * from './adapters';
