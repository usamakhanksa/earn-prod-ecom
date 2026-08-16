import type { ConnectorFieldSpec } from '@omnisell/shared';

/**
 * Field transform engine (featureslist.md 5.3, implentationplanphase.md task
 * 4.3). Pure, synchronous, no infra — same standard as Phase 2's
 * pricing/preflight engines. This is the ONE place per-channel field
 * rendering happens; the dry-run endpoint (4.4) and the publish orchestrator
 * (4.5) both call `applyChannelTransforms` so a preview can never drift from
 * what actually gets sent.
 */

export interface TruncateOptions {
  ellipsis?: string;
  /** Prefer breaking on a word boundary rather than mid-word — default true. */
  wordBoundary?: boolean;
}

/** Truncates `text` to at most `maxLen` characters (INCLUDING the ellipsis),
 * never exceeding it, preferring a word boundary. `maxLen <= 0` returns ''. */
export function truncateText(text: string, maxLen: number, options: TruncateOptions = {}): string {
  if (maxLen <= 0) {
    return '';
  }
  if (text.length <= maxLen) {
    return text;
  }
  const ellipsis = options.ellipsis ?? '…';
  const wordBoundary = options.wordBoundary ?? true;
  if (ellipsis.length >= maxLen) {
    // No room for anything but (part of) the ellipsis itself.
    return ellipsis.slice(0, maxLen);
  }
  const budget = maxLen - ellipsis.length;
  let cut = text.slice(0, budget);
  if (wordBoundary) {
    const lastSpace = cut.lastIndexOf(' ');
    // Only break on a word boundary if it doesn't throw away most of the budget.
    if (lastSpace > 0 && lastSpace >= budget * 0.5) {
      cut = cut.slice(0, lastSpace);
    }
  }
  return `${cut}${ellipsis}`;
}

/** Truncates a tag list to at most `maxTags` entries, each at most
 * `maxTagLength` characters (no ellipsis on tags — a cut tag is just cut,
 * per how most channels' tag fields behave). Returns the result plus which
 * tags were altered/dropped, for the composer's warning UI. */
export function clampTags(
  tags: string[],
  maxTags: number | null,
  maxTagLength: number | null,
): { tags: string[]; droppedCount: number; truncatedCount: number } {
  const deduped = [...new Set(tags.map((t) => t.trim()).filter((t) => t.length > 0))];
  const limited = maxTags !== null ? deduped.slice(0, Math.max(0, maxTags)) : deduped;
  let truncatedCount = 0;
  const clamped = limited.map((tag) => {
    if (maxTagLength !== null && tag.length > maxTagLength) {
      truncatedCount += 1;
      return tag.slice(0, maxTagLength);
    }
    return tag;
  });
  return { tags: clamped, droppedCount: deduped.length - limited.length, truncatedCount };
}

/** `{{var}}` template substitution — unknown placeholders are left verbatim
 * (never silently dropped, so a typo'd template key is visible in the
 * preview rather than producing a mysteriously blank field). */
export function applyTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key: string) => {
    const value = vars[key];
    return value !== undefined ? value : match;
  });
}

/** Locale string lookup with a graceful fallback to the input key itself —
 * used for e.g. mapping a placement code ("FRONT") to a human phrase in the
 * target locale for a template variable. Never throws on a missing entry. */
export function localizeValue(key: string, locale: string, dictionary: Record<string, Record<string, string>>): string {
  return dictionary[key]?.[locale] ?? dictionary[key]?.en ?? key;
}

export type LengthUnit = 'in' | 'cm' | 'mm' | 'px';

const MM_PER_IN = 25.4;

/** Physical-length unit conversion (in/cm/mm/px) — `px` requires a DPI to
 * relate it to a physical size (default 300, the print-industry standard
 * this codebase already uses in Phase 2's preflight engine). */
export function convertLength(value: number, from: LengthUnit, to: LengthUnit, dpi = 300): number {
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid length value: ${value}`);
  }
  if (dpi <= 0) {
    throw new Error(`Invalid dpi: ${dpi}`);
  }
  const toInches = (v: number, unit: LengthUnit): number => {
    switch (unit) {
      case 'in':
        return v;
      case 'cm':
        return v / 2.54;
      case 'mm':
        return v / MM_PER_IN;
      case 'px':
        return v / dpi;
    }
  };
  const fromInToTarget = (inches: number, unit: LengthUnit): number => {
    switch (unit) {
      case 'in':
        return inches;
      case 'cm':
        return inches * 2.54;
      case 'mm':
        return inches * MM_PER_IN;
      case 'px':
        return inches * dpi;
    }
  };
  return fromInToTarget(toInches(value, from), to);
}

/** Taxonomy/category mapper (5.4) — a straight lookup with an explicit
 * "unmapped" outcome (`null`) rather than guessing a fallback category, so
 * the composer/dry-run can surface "no mapping configured for X" instead of
 * silently sending the wrong category. */
export function mapTaxonomy(sourceCategory: string | null | undefined, mapping: Record<string, string>): { category: string | null; mapped: boolean } {
  if (sourceCategory === null || sourceCategory === undefined || sourceCategory.length === 0) {
    return { category: null, mapped: false };
  }
  const mapped = mapping[sourceCategory];
  return mapped !== undefined ? { category: mapped, mapped: true } : { category: sourceCategory, mapped: false };
}

export interface CanonicalListingFields {
  title: string;
  description: string;
  tags: string[];
  category?: string | null;
}

export interface FieldOverrides {
  title?: string | undefined;
  description?: string | undefined;
  tags?: string[] | undefined;
  category?: string | undefined;
}

export interface EffectiveFieldResult {
  title: string;
  description: string;
  tags: string[];
  category: string | null;
  warnings: string[];
  counters: {
    titleLength: number;
    titleMax: number | null;
    descriptionLength: number;
    descriptionMax: number | null;
    tagCount: number;
    tagMax: number | null;
  };
}

/**
 * The single composition every dry-run/publish call goes through:
 * override -> truncate to the connector's real `fieldSpec` limits (never
 * hardcoded — read from the registry, per implentationplanphase.md task 4.2's
 * explicit instruction) -> collect human-readable warnings for anything that
 * got cut. `fieldSpec` is `null` for connectors with no declared limits
 * (e.g. Tier C rows without a confirmed spec yet) — nothing is truncated in
 * that case, which is the conservative, honest default (never invent a limit
 * that wasn't confirmed).
 */
export function applyChannelTransforms(canonical: CanonicalListingFields, overrides: FieldOverrides, fieldSpec: ConnectorFieldSpec | null): EffectiveFieldResult {
  const warnings: string[] = [];

  const rawTitle = overrides.title ?? canonical.title;
  const rawDescription = overrides.description ?? canonical.description;
  const rawTags = overrides.tags ?? canonical.tags;
  const rawCategory = overrides.category ?? canonical.category ?? null;

  const titleMax = fieldSpec?.maxTitle ?? null;
  const descriptionMax = fieldSpec?.maxDescription ?? null;
  const tagMax = fieldSpec?.maxTags ?? null;

  const title = titleMax !== null && rawTitle.length > titleMax ? truncateText(rawTitle, titleMax) : rawTitle;
  if (titleMax !== null && rawTitle.length > titleMax) {
    warnings.push(`title truncated from ${rawTitle.length} to ${titleMax} characters`);
  }

  const description = descriptionMax !== null && rawDescription.length > descriptionMax ? truncateText(rawDescription, descriptionMax) : rawDescription;
  if (descriptionMax !== null && rawDescription.length > descriptionMax) {
    warnings.push(`description truncated from ${rawDescription.length} to ${descriptionMax} characters`);
  }

  const { tags, droppedCount, truncatedCount } = clampTags(rawTags, tagMax, null);
  if (droppedCount > 0) {
    warnings.push(`${droppedCount} tag(s) dropped — this channel allows at most ${tagMax}`);
  }
  if (truncatedCount > 0) {
    warnings.push(`${truncatedCount} tag(s) shortened to fit this channel's per-tag length limit`);
  }

  return {
    title,
    description,
    tags,
    category: rawCategory,
    warnings,
    counters: {
      titleLength: rawTitle.length,
      titleMax,
      descriptionLength: rawDescription.length,
      descriptionMax,
      tagCount: tags.length,
      tagMax,
    },
  };
}
