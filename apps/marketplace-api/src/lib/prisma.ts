import { PrismaClient } from '../generated/prisma-client/index.js';
import { env } from '../env.js';

/**
 * Lazy Prisma client singleton. Only ever instantiated when a repository
 * that actually needs it is constructed — which, per env.hasRealDatabase,
 * never happens in this sandbox (MOCK_MODE=true / no
 * MARKETPLACE_DATABASE_URL). This avoids attempting a Postgres connection
 * at import time.
 */
let client: PrismaClient | null = null;

export function getPrismaClient(): PrismaClient {
  if (!env.MARKETPLACE_DATABASE_URL) {
    throw new Error(
      'getPrismaClient() called without MARKETPLACE_DATABASE_URL set. ' +
        'This should only happen when MOCK_MODE=false and a real database is expected.',
    );
  }
  if (!client) {
    client = new PrismaClient({
      datasourceUrl: env.MARKETPLACE_DATABASE_URL,
    });
  }
  return client;
}
