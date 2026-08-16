import { describe, expect, it } from 'vitest';
import {
  applyChannelTransforms,
  applyTemplate,
  clampTags,
  convertLength,
  localizeValue,
  mapTaxonomy,
  truncateText,
} from '../src/publishing/transform/field-transform.engine';

describe('field-transform.engine', () => {
  describe('truncateText', () => {
    it('leaves short text untouched', () => {
      expect(truncateText('hello', 20)).toBe('hello');
    });

    it('never exceeds maxLen including the ellipsis', () => {
      const result = truncateText('a beautifully hand-painted design for coffee lovers', 20);
      expect(result.length).toBeLessThanOrEqual(20);
      expect(result.endsWith('…')).toBe(true);
    });

    it('prefers a word boundary when it does not waste most of the budget', () => {
      const result = truncateText('one two three four five', 12);
      expect(result).toBe('one two…');
      expect(result.length).toBeLessThanOrEqual(12);
    });

    it('falls back to a hard cut when the word boundary would waste too much budget', () => {
      const result = truncateText('supercalifragilisticexpialidocious word', 10);
      expect(result.length).toBeLessThanOrEqual(10);
      expect(result.endsWith('…')).toBe(true);
    });

    it('maxLen <= 0 returns empty string', () => {
      expect(truncateText('anything', 0)).toBe('');
      expect(truncateText('anything', -5)).toBe('');
    });

    it('handles an ellipsis wider than maxLen without throwing', () => {
      expect(truncateText('hello world', 1, { ellipsis: '...' })).toBe('.');
    });

    it('supports a custom ellipsis', () => {
      const result = truncateText('hello world', 8, { ellipsis: '...' });
      expect(result).toBe('hello...');
    });
  });

  describe('clampTags', () => {
    it('deduplicates and trims', () => {
      const { tags } = clampTags([' cat ', 'cat', 'dog', ''], null, null);
      expect(tags).toEqual(['cat', 'dog']);
    });

    it('drops tags beyond maxTags and reports the dropped count', () => {
      const { tags, droppedCount } = clampTags(['a', 'b', 'c', 'd'], 2, null);
      expect(tags).toEqual(['a', 'b']);
      expect(droppedCount).toBe(2);
    });

    it('truncates individual tags beyond maxTagLength and reports the count', () => {
      const { tags, truncatedCount } = clampTags(['verylongtagname'], null, 5);
      expect(tags).toEqual(['veryl']);
      expect(truncatedCount).toBe(1);
    });

    it('null limits mean no clamping at all', () => {
      const { tags, droppedCount, truncatedCount } = clampTags(['a', 'b', 'c'], null, null);
      expect(tags).toEqual(['a', 'b', 'c']);
      expect(droppedCount).toBe(0);
      expect(truncatedCount).toBe(0);
    });
  });

  describe('applyTemplate', () => {
    it('substitutes known variables', () => {
      expect(applyTemplate('{{title}} — by {{artist}}', { title: 'Sunset', artist: 'Nour' })).toBe('Sunset — by Nour');
    });

    it('leaves unknown placeholders verbatim rather than dropping them', () => {
      expect(applyTemplate('{{title}} {{unknownVar}}', { title: 'Sunset' })).toBe('Sunset {{unknownVar}}');
    });

    it('handles whitespace inside the placeholder braces', () => {
      expect(applyTemplate('{{ title }}', { title: 'Sunset' })).toBe('Sunset');
    });
  });

  describe('localizeValue', () => {
    it('returns the locale-specific value when present', () => {
      const dict = { FRONT: { en: 'Front', ar: 'الأمام' } };
      expect(localizeValue('FRONT', 'ar', dict)).toBe('الأمام');
    });

    it('falls back to english when the requested locale is missing', () => {
      const dict = { FRONT: { en: 'Front' } };
      expect(localizeValue('FRONT', 'ar', dict)).toBe('Front');
    });

    it('falls back to the key itself when nothing matches', () => {
      expect(localizeValue('UNKNOWN_CODE', 'ar', {})).toBe('UNKNOWN_CODE');
    });
  });

  describe('convertLength', () => {
    it('converts inches to millimetres', () => {
      expect(convertLength(1, 'in', 'mm')).toBeCloseTo(25.4, 5);
    });

    it('converts centimetres to inches', () => {
      expect(convertLength(2.54, 'cm', 'in')).toBeCloseTo(1, 5);
    });

    it('converts pixels to inches at a given DPI', () => {
      expect(convertLength(300, 'px', 'in', 300)).toBeCloseTo(1, 5);
    });

    it('converts inches to pixels at a given DPI', () => {
      expect(convertLength(2, 'in', 'px', 150)).toBeCloseTo(300, 5);
    });

    it('is a round-trip identity within floating point tolerance', () => {
      const px = convertLength(12.5, 'cm', 'px', 300);
      const back = convertLength(px, 'px', 'cm', 300);
      expect(back).toBeCloseTo(12.5, 3);
    });

    it('rejects a non-finite value', () => {
      expect(() => convertLength(Number.NaN, 'in', 'cm')).toThrow();
    });

    it('rejects a non-positive DPI', () => {
      expect(() => convertLength(1, 'px', 'in', 0)).toThrow();
    });
  });

  describe('mapTaxonomy', () => {
    it('returns the mapped category when a mapping exists', () => {
      expect(mapTaxonomy('APPAREL', { APPAREL: 'clothing-adult-unisex' })).toEqual({ category: 'clothing-adult-unisex', mapped: true });
    });

    it('returns the source category unmapped when no mapping exists — never invents one', () => {
      expect(mapTaxonomy('DRINKWARE', {})).toEqual({ category: 'DRINKWARE', mapped: false });
    });

    it('returns null for a missing/empty source category', () => {
      expect(mapTaxonomy(null, {})).toEqual({ category: null, mapped: false });
      expect(mapTaxonomy('', {})).toEqual({ category: null, mapped: false });
    });
  });

  describe('applyChannelTransforms', () => {
    const canonical = { title: 'A Very Long Original Product Title About Coffee Mugs', description: 'A'.repeat(50), tags: ['coffee', 'mug', 'gift', 'birthday'], category: 'DRINKWARE' };

    it('uses the canonical fields untouched when no fieldSpec/overrides apply', () => {
      const result = applyChannelTransforms(canonical, {}, null);
      expect(result.title).toBe(canonical.title);
      expect(result.description).toBe(canonical.description);
      expect(result.tags).toEqual(canonical.tags);
      expect(result.warnings).toEqual([]);
    });

    it('applies a per-channel override in place of the canonical field', () => {
      const result = applyChannelTransforms(canonical, { title: 'Channel-specific title' }, null);
      expect(result.title).toBe('Channel-specific title');
    });

    it('truncates to the connector fieldSpec and records a warning', () => {
      const result = applyChannelTransforms(canonical, {}, { maxTitle: 20, maxDescription: 1000, maxTags: 10, imageSpecs: [] });
      expect(result.title.length).toBeLessThanOrEqual(20);
      expect(result.warnings.some((w) => w.includes('title truncated'))).toBe(true);
    });

    it('drops tags beyond the connector max and records a warning', () => {
      const result = applyChannelTransforms(canonical, {}, { maxTitle: 500, maxDescription: 1000, maxTags: 2, imageSpecs: [] });
      expect(result.tags).toHaveLength(2);
      expect(result.warnings.some((w) => w.includes('tag'))).toBe(true);
    });

    it('reports accurate counters against the real fieldSpec limits, never hardcoded', () => {
      const result = applyChannelTransforms(canonical, {}, { maxTitle: 30, maxDescription: 40, maxTags: 3, imageSpecs: [] });
      expect(result.counters.titleMax).toBe(30);
      expect(result.counters.descriptionMax).toBe(40);
      expect(result.counters.tagMax).toBe(3);
    });
  });
});
