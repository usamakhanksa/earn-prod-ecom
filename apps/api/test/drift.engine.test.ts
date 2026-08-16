import { describe, expect, it } from 'vitest';
import { computeDrift, type LocalListingSnapshot, type RemoteListingSnapshot } from '../src/publishing/drift/drift.engine';

const local: LocalListingSnapshot = { title: 'Sunset Mug', description: 'A calm print', tags: ['sunset', 'mug'], priceMinor: 1999n, currency: 'USD', status: 'LIVE' };

describe('drift.engine', () => {
  it('reports no diffs when local and remote are identical', () => {
    const remote: RemoteListingSnapshot = { ...local };
    expect(computeDrift(local, remote)).toHaveLength(0);
  });

  it('detects a title diff', () => {
    const diffs = computeDrift(local, { ...local, title: 'Sunset Mug (edited on channel)' });
    expect(diffs).toEqual([{ field: 'title', local: 'Sunset Mug', remote: 'Sunset Mug (edited on channel)' }]);
  });

  it('detects a price/currency diff', () => {
    const diffs = computeDrift(local, { ...local, priceMinor: 2499n });
    expect(diffs[0]?.field).toBe('priceMinor');
  });

  it('tag order does not count as drift, but a real tag difference does', () => {
    expect(computeDrift(local, { ...local, tags: ['mug', 'sunset'] })).toHaveLength(0);
    expect(computeDrift(local, { ...local, tags: ['mug', 'sunrise'] })).toHaveLength(1);
  });

  it('detects a status diff', () => {
    const diffs = computeDrift(local, { ...local, status: 'ERROR' });
    expect(diffs[0]).toEqual({ field: 'status', local: 'LIVE', remote: 'ERROR' });
  });

  it('reports multiple diffs at once', () => {
    const diffs = computeDrift(local, { ...local, title: 'New title', priceMinor: 1n });
    expect(diffs).toHaveLength(2);
  });
});
