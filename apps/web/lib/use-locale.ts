'use client';

import { useEffect, useState } from 'react';
import type { Locale } from '@omnisell/i18n';

/** Reads the same `omnisell-locale` cookie the server layout used, so
 * client-rendered text matches (apps/web/app/layout.tsx sets it). Shared
 * here for Phase 2's new pages — earlier pages each inlined this same
 * function (team/dashboard); not touching those, just not repeating a third
 * time. */
export function useLocale(): Locale {
  const [locale, setLocale] = useState<Locale>('en');
  useEffect(() => {
    const match = document.cookie.split('; ').find((row) => row.startsWith('omnisell-locale='));
    setLocale(match?.slice('omnisell-locale='.length) === 'ar' ? 'ar' : 'en');
  }, []);
  return locale;
}
