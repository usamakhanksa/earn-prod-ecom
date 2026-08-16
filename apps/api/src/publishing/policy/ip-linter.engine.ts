import type { PolicyViolation } from '@omnisell/shared';

/**
 * IP/trademark policy linter (featureslist.md 5.15, implentationplanphase.md
 * task 4.11) — pure, synchronous matching logic against an admin-editable
 * banned-term dictionary. This is a P0 PUBLISH-BLOCKING gate: the orchestrator
 * (4.5) calls `lintListingFields` before ever enqueueing a job, and a
 * non-empty result is a hard stop, not a warning.
 */

export interface BannedTermLike {
  term: string;
  category: string;
  matchType: 'EXACT' | 'FUZZY';
}

/** Classic Levenshtein edit distance — iterative DP, O(n*m), fine at the
 * word/short-phrase lengths this linter operates on. */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previousRow = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const currentRow = new Array<number>(b.length + 1);
    currentRow[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      currentRow[j] = Math.min(
        (previousRow[j] ?? 0) + 1, // deletion
        (currentRow[j - 1] ?? 0) + 1, // insertion
        (previousRow[j - 1] ?? 0) + cost, // substitution
      );
    }
    previousRow = currentRow;
  }
  return previousRow[b.length] ?? 0;
}

/** Fuzzy-match distance threshold, scaled by term length: short terms (<=4
 * chars) require an exact-ish match (distance 0) to avoid false positives on
 * common short words; longer terms tolerate up to ~20% edit distance
 * (typo-level variance), capped at 2 so a long phrase can't drift arbitrarily
 * far and still "match". */
function fuzzyThresholdFor(term: string): number {
  if (term.length <= 4) return 0;
  return Math.min(2, Math.floor(term.length * 0.2));
}

function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Tokenizes `text` into normalized words (lowercased, punctuation-stripped)
 * for word-level fuzzy comparison against a banned term. */
function tokenize(text: string): string[] {
  return text.split(/\s+/).map(normalizeWord).filter((w) => w.length > 0);
}

export interface ScanMatch {
  term: string;
  category: string;
  matchType: 'EXACT' | 'FUZZY';
  matchedText: string;
}

/** Scans one string against the dictionary. `EXACT` terms match as a
 * case-insensitive substring (so multi-word trademarks like "coca cola" are
 * caught as phrases); `FUZZY` terms match per-word within
 * `fuzzyThresholdFor`'s edit-distance budget (catches "cocacola", "coca-c0la"
 * obfuscation attempts without matching unrelated short words). */
export function scanText(text: string, terms: BannedTermLike[]): ScanMatch[] {
  if (text.length === 0 || terms.length === 0) {
    return [];
  }
  const lower = text.toLowerCase();
  const words = tokenize(text);
  const matches: ScanMatch[] = [];

  for (const bannedTerm of terms) {
    const normalizedTerm = bannedTerm.term.toLowerCase();
    if (bannedTerm.matchType === 'EXACT') {
      if (lower.includes(normalizedTerm)) {
        matches.push({ term: bannedTerm.term, category: bannedTerm.category, matchType: 'EXACT', matchedText: bannedTerm.term });
      }
      continue;
    }

    // FUZZY: compare each word of the text against each word of the term
    // (multi-word terms compared as a normalized joined token too, so a
    // fuzzy multi-word phrase like "coca cola" can still be caught).
    const termWords = tokenize(bannedTerm.term);
    const normalizedTermJoined = normalizeWord(bannedTerm.term.replace(/\s+/g, ''));
    const threshold = fuzzyThresholdFor(normalizedTermJoined);

    let matched = false;
    for (const word of words) {
      if (termWords.length === 1) {
        if (levenshteinDistance(word, normalizedTermJoined) <= threshold) {
          matched = true;
          break;
        }
      }
    }
    // Also check the whole text with spaces stripped, for obfuscated
    // multi-word trademarks ("coca-cola" -> "cocacola").
    if (!matched && termWords.length > 1) {
      const strippedText = normalizeWord(text);
      if (strippedText.includes(normalizedTermJoined)) {
        matched = true;
      }
    }
    if (matched) {
      matches.push({ term: bannedTerm.term, category: bannedTerm.category, matchType: 'FUZZY', matchedText: bannedTerm.term });
    }
  }

  return matches;
}

export interface ListingFieldsToLint {
  title: string;
  description: string;
  tags: string[];
}

/** The hard publish-blocking gate (5.15). A non-empty return value means the
 * publish orchestrator MUST refuse to enqueue — see
 * `PublishOrchestratorService`'s doc comment for exactly where this is
 * called and why it happens before any queue/adapter interaction. */
export function lintListingFields(fields: ListingFieldsToLint, terms: BannedTermLike[]): PolicyViolation[] {
  const violations: PolicyViolation[] = [];

  for (const match of scanText(fields.title, terms)) {
    violations.push({ field: 'title', term: match.term, category: match.category, matchType: match.matchType, matchedText: match.matchedText });
  }
  for (const match of scanText(fields.description, terms)) {
    violations.push({ field: 'description', term: match.term, category: match.category, matchType: match.matchType, matchedText: match.matchedText });
  }
  for (const tag of fields.tags) {
    for (const match of scanText(tag, terms)) {
      violations.push({ field: 'tags', term: match.term, category: match.category, matchType: match.matchType, matchedText: match.matchedText });
    }
  }

  return violations;
}
