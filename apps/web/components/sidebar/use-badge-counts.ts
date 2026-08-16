'use client';

import { useEffect, useState } from 'react';
import type { NotificationSummary, Page } from '@omnisell/shared';
import { useSession } from '@/lib/session-context';

const POLL_MS = 60_000; // featureslist.md §0.1 — "poll every 60s via SSE"; SSE lands
// in a later pass (docs/DEBT.md), this is the honest polling fallback for now.

/** Only real, fetched counts — everything else in the nav tree deliberately
 * has no badge rather than showing a fabricated number (prompt.md: no UI that
 * renders mock/hardcoded data). */
export function useBadgeCounts(): Partial<Record<'notifications', number>> {
  const { client, currentTenantId } = useSession();
  const [counts, setCounts] = useState<Partial<Record<'notifications', number>>>({});

  useEffect(() => {
    if (currentTenantId === null) {
      return;
    }
    let cancelled = false;

    async function poll(): Promise<void> {
      try {
        const page = await client.get<Page<NotificationSummary>>('/notifications', { limit: 50 });
        if (!cancelled) {
          const unread = page.items.filter((item) => item.readAt === null).length;
          setCounts({ notifications: unread });
        }
      } catch {
        // Badge counts degrade to "unknown" (no badge) rather than surfacing
        // an error state in the sidebar chrome.
      }
    }

    void poll();
    const interval = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [client, currentTenantId]);

  return counts;
}
