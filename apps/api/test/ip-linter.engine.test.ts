import { describe, expect, it } from 'vitest';
import { levenshteinDistance, lintListingFields, scanText, type BannedTermLike } from '../src/publishing/policy/ip-linter.engine';

describe('ip-linter.engine', () => {
  describe('levenshteinDistance', () => {
    it('is 0 for identical strings', () => {
      expect(levenshteinDistance('disney', 'disney')).toBe(0);
    });

    it('is the string length for an empty comparison', () => {
      expect(levenshteinDistance('', 'abc')).toBe(3);
      expect(levenshteinDistance('abc', '')).toBe(3);
    });

    it('counts a single substitution as distance 1', () => {
      expect(levenshteinDistance('disney', 'disney'.replace('e', 'a'))).toBe(1);
    });

    it('counts insertions/deletions correctly', () => {
      expect(levenshteinDistance('mario', 'mari')).toBe(1);
      expect(levenshteinDistance('mario', 'mariio')).toBe(1);
    });

    it('is symmetric', () => {
      expect(levenshteinDistance('kitten', 'sitting')).toBe(levenshteinDistance('sitting', 'kitten'));
    });
  });

  describe('scanText', () => {
    const exactTerm: BannedTermLike = { term: 'Coca-Cola', category: 'TRADEMARK', matchType: 'EXACT' };
    const fuzzyTerm: BannedTermLike = { term: 'Disney', category: 'TRADEMARK', matchType: 'FUZZY' };

    it('EXACT matches a case-insensitive substring', () => {
      const matches = scanText('Vintage Coca-cola advert mug', [exactTerm]);
      expect(matches).toHaveLength(1);
      expect(matches[0]?.term).toBe('Coca-Cola');
    });

    it('EXACT does not match when the phrase is absent', () => {
      expect(scanText('A plain coffee mug', [exactTerm])).toHaveLength(0);
    });

    it('FUZZY matches an exact word', () => {
      expect(scanText('Disney inspired mug', [fuzzyTerm])).toHaveLength(1);
    });

    it('FUZZY matches a close typo/obfuscation of a longer word', () => {
      expect(scanText('Dizney themed shirt', [fuzzyTerm])).toHaveLength(1);
      expect(scanText('D1sney world tour', [fuzzyTerm])).toHaveLength(1);
    });

    it('FUZZY does not match an unrelated word', () => {
      expect(scanText('A generic vacation shirt', [fuzzyTerm])).toHaveLength(0);
    });

    it('FUZZY on short terms requires an exact word match (no false positives on common short words)', () => {
      const shortTerm: BannedTermLike = { term: 'Nike', category: 'TRADEMARK', matchType: 'FUZZY' };
      expect(scanText('nice mug', [shortTerm])).toHaveLength(0);
      expect(scanText('Nike inspired', [shortTerm])).toHaveLength(1);
    });

    it('matches a fuzzy multi-word trademark even with punctuation stripped', () => {
      const term: BannedTermLike = { term: 'Star Wars', category: 'TRADEMARK', matchType: 'FUZZY' };
      expect(scanText('starwars fan art', [term])).toHaveLength(1);
    });

    it('empty text or empty dictionary returns no matches', () => {
      expect(scanText('', [exactTerm])).toHaveLength(0);
      expect(scanText('Coca-Cola', [])).toHaveLength(0);
    });
  });

  describe('lintListingFields — the publish-blocking gate', () => {
    const terms: BannedTermLike[] = [
      { term: 'Disney', category: 'TRADEMARK', matchType: 'FUZZY' },
      { term: 'Coca-Cola', category: 'TRADEMARK', matchType: 'EXACT' },
    ];

    it('returns no violations for clean fields', () => {
      const violations = lintListingFields({ title: 'Sunset over the mountains', description: 'A calming print', tags: ['nature', 'sunset'] }, terms);
      expect(violations).toHaveLength(0);
    });

    it('flags a violation in the title', () => {
      const violations = lintListingFields({ title: 'Disney Princess Mug', description: '', tags: [] }, terms);
      expect(violations).toHaveLength(1);
      expect(violations[0]?.field).toBe('title');
    });

    it('flags a violation in the description', () => {
      const violations = lintListingFields({ title: 'Clean title', description: 'Inspired by Coca-Cola branding', tags: [] }, terms);
      expect(violations).toHaveLength(1);
      expect(violations[0]?.field).toBe('description');
    });

    it('flags a violation in tags', () => {
      const violations = lintListingFields({ title: 'Clean', description: 'clean', tags: ['disney', 'mug'] }, terms);
      expect(violations).toHaveLength(1);
      expect(violations[0]?.field).toBe('tags');
    });

    it('flags multiple violations across multiple fields', () => {
      const violations = lintListingFields({ title: 'Disney fan mug', description: 'Coca-Cola vibes', tags: [] }, terms);
      expect(violations).toHaveLength(2);
    });
  });
});
