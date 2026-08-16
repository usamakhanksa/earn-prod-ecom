import { useCallback, useEffect, useState } from 'react';

/**
 * Creator ⇄ Consumer mode switcher (docs/points-extension.md §10.1 — "state
 * persisted per user; correctly labelled + `aria-pressed`; RTL-safe").
 * Persisted client-side (localStorage, keyed by user id) — same pattern the
 * sidebar's own collapse state already uses (`sidebar.tsx`'s `storageKey`).
 */
function storageKey(userId: string | null): string {
  return `omnisell_consumer_mode_${userId ?? 'anon'}`;
}

export function useConsumerMode(userId: string | null): [boolean, (next: boolean) => void] {
  const [isConsumer, setIsConsumer] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey(userId));
    setIsConsumer(stored === '1');
  }, [userId]);

  const setMode = useCallback(
    (next: boolean) => {
      setIsConsumer(next);
      window.localStorage.setItem(storageKey(userId), next ? '1' : '0');
    },
    [userId],
  );

  return [isConsumer, setMode];
}
