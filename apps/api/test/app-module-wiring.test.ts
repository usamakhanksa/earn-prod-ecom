import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';

/**
 * Compiles the ENTIRE `AppModule` DI graph — no mocks, no live DB/Redis
 * required (Prisma/ioredis are both lazy-connect by default, confirmed by
 * `test/prisma.service.test.ts`'s equivalent claim for Prisma alone). This is
 * exactly the check that would have caught two real Phase 3 wiring bugs
 * before a manual `node dist/main.js` boot did: `ConnectorsModule` missing
 * `AdminModule` (so `AdminOnlyGuard` couldn't be resolved for its admin
 * routes) and `ConnectorsModule`/`ConnectionsModule`/`BlueprintsModule`
 * missing `IdempotencyModule`. See docs/phases/PHASE_3_REPORT.md "Bugs found".
 */
describe('AppModule DI wiring', () => {
  it('compiles the full application module graph without an unresolved provider', async () => {
    // `ConnectorQueueService` (Phase 3 task 3.6) constructs real BullMQ
    // `Queue` instances against `REDIS_URL`; there is no Redis in this
    // sandbox, so ioredis's own background reconnect timer can fire a
    // "Connection is closed" rejection microtask AFTER `moduleRef.close()`
    // already tore the socket down — a benign artifact of testing queue
    // wiring with zero real infrastructure, not a defect in the module graph
    // this test actually verifies. Scoped to this one test, not global.
    const onUnhandledRejection = (reason: unknown): void => {
      if (!(reason instanceof Error) || reason.message !== 'Connection is closed.') {
        throw reason;
      }
    };
    process.on('unhandledRejection', onUnhandledRejection);

    try {
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
      expect(moduleRef).toBeDefined();
      await moduleRef.close();
      // ioredis's bounded retryStrategy (redis-connection.ts, up to 3 attempts)
      // can still fire a rejection a moment after close() resolves — give it
      // a grace window before uninstalling the listener above.
      await new Promise((resolve) => setTimeout(resolve, 4000));
    } finally {
      process.off('unhandledRejection', onUnhandledRejection);
    }
  }, 30_000);
});
