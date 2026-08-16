import type { DriftFieldDiff } from '@omnisell/shared';

/**
 * Drift detection's pure comparison logic (featureslist.md 5.12,
 * implentationplanphase.md task 4.13) — local `Listing` state vs. the
 * channel's real, live state. Deliberately separated from
 * `DriftDetectionService` (which needs a real `adapter.fetchListingState`
 * call — not implemented by any of the four Phase 3 adapters yet, see the
 * doc comment on that optional SDK method) so this comparison itself is
 * fully unit-testable with fixtures, independent of that gap.
 */
export interface LocalListingSnapshot {
  title: string;
  description: string;
  tags: string[];
  priceMinor: bigint;
  currency: string;
  status: string;
}

export interface RemoteListingSnapshot {
  title: string;
  description: string;
  tags: string[];
  priceMinor: bigint;
  currency: string;
  status: string;
}

function tagsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((tag, i) => tag === sortedB[i]);
}

export function computeDrift(local: LocalListingSnapshot, remote: RemoteListingSnapshot): DriftFieldDiff[] {
  const diffs: DriftFieldDiff[] = [];
  if (local.title !== remote.title) {
    diffs.push({ field: 'title', local: local.title, remote: remote.title });
  }
  if (local.description !== remote.description) {
    diffs.push({ field: 'description', local: local.description, remote: remote.description });
  }
  if (!tagsEqual(local.tags, remote.tags)) {
    diffs.push({ field: 'tags', local: local.tags, remote: remote.tags });
  }
  if (local.priceMinor !== remote.priceMinor || local.currency !== remote.currency) {
    diffs.push({ field: 'priceMinor', local: `${local.priceMinor} ${local.currency}`, remote: `${remote.priceMinor} ${remote.currency}` });
  }
  if (local.status !== remote.status) {
    diffs.push({ field: 'status', local: local.status, remote: remote.status });
  }
  return diffs;
}
