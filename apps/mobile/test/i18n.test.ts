import { describe, expect, it } from 'vitest';
import { createTranslator } from '@omnisell/i18n';

describe('mobile i18n', () => {
  it('resolves the same keys used by native screens', () => {
    const { t } = createTranslator('en');
    expect(t('nav.wallet')).toBe('Wallet');
    expect(t('nav.videos')).toBe('Videos');
  });
});