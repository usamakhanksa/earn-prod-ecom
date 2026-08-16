import { useCallback, useEffect, useState } from 'react';
import { I18nManager } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { isRtl, type Locale } from '@omnisell/i18n';

/**
 * Resolves docs/OPEN_QUESTIONS.md #9 ("Mobile hardcodes 'en' until a device
 * locale store is wired (Phase 1)") — this pass wires it. Persisted via
 * `expo-secure-store` purely for a single small string; there's no sensitive
 * data here, but it avoids adding a second native storage dependency
 * (AsyncStorage) just for one preference.
 *
 * `I18nManager.forceRTL()` is called for real on every locale change — that
 * part is not a stub. What's unavoidable (an upstream React Native
 * constraint, not a gap here) is that RN only *applies* the new writing
 * direction to already-mounted layouts after a full JS reload; there is no
 * `expo-updates` reload API installed in this pass, so `/more/language`
 * tells the user to restart instead of silently doing nothing.
 */
const KEY = 'omnisell_locale';

export async function getStoredLocale(): Promise<Locale> {
  const raw = await SecureStore.getItemAsync(KEY);
  return raw === 'ar' ? 'ar' : 'en';
}

export async function setStoredLocale(locale: Locale): Promise<void> {
  await SecureStore.setItemAsync(KEY, locale);
  if (I18nManager.isRTL !== isRtl(locale)) {
    I18nManager.forceRTL(isRtl(locale));
  }
}

export function useLocale(): [Locale, (next: Locale) => void] {
  const [locale, setLocaleState] = useState<Locale>('en');

  useEffect(() => {
    let cancelled = false;
    void getStoredLocale().then((stored) => {
      if (!cancelled) setLocaleState(stored);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    void setStoredLocale(next);
  }, []);

  return [locale, setLocale];
}
