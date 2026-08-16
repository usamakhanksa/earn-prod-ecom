import { describe, expect, it } from 'vitest';
import { createTranslator, dirForLocale, isRtl, messagesByLocale } from '../src/index';

describe('i18n package', () => {
  it('provides both locales with matching key sets', () => {
    const enKeys = Object.keys(messagesByLocale.en).sort();
    const arKeys = Object.keys(messagesByLocale.ar).sort();
    expect(enKeys).toEqual(arKeys);
    expect(enKeys.length).toBeGreaterThan(10);
  });

  it('treats Arabic as RTL and English as LTR', () => {
    expect(isRtl('ar')).toBe(true);
    expect(isRtl('en')).toBe(false);
    expect(dirForLocale('ar')).toBe('rtl');
    expect(dirForLocale('en')).toBe('ltr');
  });

  it('interpolates params', () => {
    const { t } = createTranslator('en');
    expect(t('errors.pointsCooldown', { retryIn: '5 min' })).toBe("You can earn again in 5 min.");
  });

  it('returns the key when a translation is missing', () => {
    const { t } = createTranslator('en');
    expect(t('nope.missing')).toBe('nope.missing');
  });
});