import { describe, expect, it, vi } from 'vitest';
import { SchedulingService } from '../src/publishing/scheduling/scheduling.service';
import type { ListingRepository } from '../src/repositories/listing.repository';
import type { PublishOrchestratorService } from '../src/publishing/publish-orchestrator.service';

function makeDeps(due: Array<{ id: string; scheduledAt: Date | null }>) {
  const listings = { findDueScheduled: vi.fn().mockResolvedValue(due) };
  const orchestrator = { publishExistingListing: vi.fn().mockResolvedValue({ ok: true, error: null }) };
  return { listings, orchestrator };
}

function makeService(deps: ReturnType<typeof makeDeps>): SchedulingService {
  return new SchedulingService(deps.listings as unknown as ListingRepository, deps.orchestrator as unknown as PublishOrchestratorService);
}

describe('SchedulingService.runDueSweep', () => {
  it('publishes every due listing and counts successes', async () => {
    const now = new Date('2026-08-12T12:00:00Z');
    const deps = makeDeps([{ id: 'l1', scheduledAt: new Date('2026-08-12T11:00:00Z') }, { id: 'l2', scheduledAt: new Date('2026-08-12T11:30:00Z') }]);
    const service = makeService(deps);
    const result = await service.runDueSweep('t1', 'system', now);
    expect(result).toEqual({ published: 2, failed: 0 });
    expect(deps.orchestrator.publishExistingListing).toHaveBeenCalledTimes(2);
  });

  it('counts a failed publish outcome without throwing', async () => {
    const now = new Date('2026-08-12T12:00:00Z');
    const deps = makeDeps([{ id: 'l1', scheduledAt: new Date('2026-08-12T11:00:00Z') }]);
    deps.orchestrator.publishExistingListing.mockResolvedValue({ ok: false, error: 'queue unavailable' });
    const service = makeService(deps);
    const result = await service.runDueSweep('t1', 'system', now);
    expect(result).toEqual({ published: 0, failed: 1 });
  });

  it('counts a thrown error as a failure rather than crashing the whole sweep', async () => {
    const now = new Date('2026-08-12T12:00:00Z');
    const deps = makeDeps([{ id: 'l1', scheduledAt: new Date('2026-08-12T11:00:00Z') }, { id: 'l2', scheduledAt: new Date('2026-08-12T11:00:00Z') }]);
    deps.orchestrator.publishExistingListing.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({ ok: true, error: null });
    const service = makeService(deps);
    const result = await service.runDueSweep('t1', 'system', now);
    expect(result).toEqual({ published: 1, failed: 1 });
  });

  it('does nothing when no listing is due', async () => {
    const deps = makeDeps([]);
    const service = makeService(deps);
    const result = await service.runDueSweep('t1', 'system');
    expect(result).toEqual({ published: 0, failed: 0 });
  });
});
