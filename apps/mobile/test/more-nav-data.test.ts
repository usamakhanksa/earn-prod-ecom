import { describe, expect, it } from 'vitest';
import { messagesByLocale } from '@omnisell/i18n';
import { MORE_SECTIONS } from '../lib/more-nav-data';

describe('MORE_SECTIONS (mobile "More" drawer)', () => {
  it('only references i18n keys that actually exist in both locales', () => {
    for (const section of MORE_SECTIONS) {
      expect(messagesByLocale.en[section.labelKey]).toBeDefined();
      expect(messagesByLocale.ar[section.labelKey]).toBeDefined();
      for (const row of section.rows) {
        expect(messagesByLocale.en[row.labelKey]).toBeDefined();
        expect(messagesByLocale.ar[row.labelKey]).toBeDefined();
      }
    }
  });

  it('routes consumer-mode rows to real screens, everything else to /more/:slug or a dedicated screen', () => {
    for (const section of MORE_SECTIONS) {
      for (const row of section.rows) {
        const isConsumerRoute = row.href.startsWith('/consumer/');
        const isMoreRoute = row.href.startsWith('/more/');
        expect(isConsumerRoute || isMoreRoute).toBe(true);
      }
    }
  });
});
