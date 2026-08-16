import { describe, expect, it } from 'vitest';
import type { PreflightAssetInput, PrintAreaSpec } from '@omnisell/shared';
import { runPreflight } from '../src/studio/preflight/preflight.engine';

const GOOD_ASSET: PreflightAssetInput = {
  widthPx: 4500,
  heightPx: 5400,
  dpi: 300,
  colorProfile: 'CMYK',
  hasTransparency: false,
  minStrokeWidthPx: 6, // 6px at 300dpi = 0.02in = 1.44pt, above the 1pt recommendation
  sizeBytes: 5 * 1024 * 1024,
};

const FRONT_PRINT_AREA: PrintAreaSpec = {
  code: 'FRONT',
  name: 'Front',
  widthIn: 12,
  heightIn: 16,
  dpiMin: 150,
  dpiRecommended: 300,
  bleedIn: 0.125,
  safeAreaIn: 0.25,
  allowsTransparency: false,
  colorProfile: 'CMYK',
  maxFileSizeMb: 50,
};

describe('runPreflight — overall rollup', () => {
  it('passes a well-formed asset against a matching print area', () => {
    const report = runPreflight(GOOD_ASSET, FRONT_PRINT_AREA);
    expect(report.overallStatus).toBe('PASS');
    expect(report.rules).toHaveLength(7);
    expect(report.rules.every((r) => r.status === 'PASS')).toBe(true);
  });

  it('reports SKIPPED for blueprint-relative rules when no print area is given', () => {
    const report = runPreflight(GOOD_ASSET);
    const dimensions = report.rules.find((r) => r.rule === 'DIMENSIONS');
    const bleed = report.rules.find((r) => r.rule === 'BLEED_SAFE_AREA');
    const transparency = report.rules.find((r) => r.rule === 'TRANSPARENCY');
    expect(dimensions?.status).toBe('SKIPPED');
    expect(bleed?.status).toBe('SKIPPED');
    expect(transparency?.status).toBe('SKIPPED');
    // DPI/file-size/color-profile/stroke-width still evaluate against generic
    // fallback thresholds even without a blueprint context.
    expect(report.overallStatus).toBe('PASS');
  });

  it('rolls up to FAIL if any single rule fails, even when others pass', () => {
    const report = runPreflight({ ...GOOD_ASSET, sizeBytes: 999 * 1024 * 1024 }, FRONT_PRINT_AREA);
    expect(report.overallStatus).toBe('FAIL');
  });

  it('rolls up to WARN when no rule fails but at least one warns', () => {
    const report = runPreflight({ ...GOOD_ASSET, dpi: 200 }, FRONT_PRINT_AREA); // between min(150) and recommended(300)
    expect(report.overallStatus).toBe('WARN');
  });
});

describe('FILE_SIZE rule', () => {
  it('fails when the asset exceeds the blueprint print area ceiling', () => {
    const report = runPreflight({ ...GOOD_ASSET, sizeBytes: 60 * 1024 * 1024 }, FRONT_PRINT_AREA);
    const rule = report.rules.find((r) => r.rule === 'FILE_SIZE');
    expect(rule?.status).toBe('FAIL');
  });

  it('falls back to the platform default ceiling (200MB) with no print area', () => {
    const underDefault = runPreflight({ ...GOOD_ASSET, sizeBytes: 150 * 1024 * 1024 });
    expect(underDefault.rules.find((r) => r.rule === 'FILE_SIZE')?.status).toBe('PASS');
    const overDefault = runPreflight({ ...GOOD_ASSET, sizeBytes: 250 * 1024 * 1024 });
    expect(overDefault.rules.find((r) => r.rule === 'FILE_SIZE')?.status).toBe('FAIL');
  });

  it('passes comfortably under the ceiling', () => {
    const rule = runPreflight(GOOD_ASSET, FRONT_PRINT_AREA).rules.find((r) => r.rule === 'FILE_SIZE');
    expect(rule?.status).toBe('PASS');
  });
});

describe('DPI rule', () => {
  it('warns when dpi metadata is missing', () => {
    const rule = runPreflight({ ...GOOD_ASSET, dpi: null }, FRONT_PRINT_AREA).rules.find((r) => r.rule === 'DPI');
    expect(rule?.status).toBe('WARN');
    expect(rule?.messageKey).toBe('studio.preflight.rule.dpi.unknown');
  });

  it('fails below the blueprint minimum dpi', () => {
    const rule = runPreflight({ ...GOOD_ASSET, dpi: 100 }, FRONT_PRINT_AREA).rules.find((r) => r.rule === 'DPI');
    expect(rule?.status).toBe('FAIL');
  });

  it('warns between minimum and recommended dpi', () => {
    const rule = runPreflight({ ...GOOD_ASSET, dpi: 200 }, FRONT_PRINT_AREA).rules.find((r) => r.rule === 'DPI');
    expect(rule?.status).toBe('WARN');
  });

  it('passes at or above the recommended dpi', () => {
    const rule = runPreflight({ ...GOOD_ASSET, dpi: 300 }, FRONT_PRINT_AREA).rules.find((r) => r.rule === 'DPI');
    expect(rule?.status).toBe('PASS');
  });

  it('uses generic thresholds (100 min / 300 recommended) without a print area', () => {
    expect(runPreflight({ ...GOOD_ASSET, dpi: 90 }).rules.find((r) => r.rule === 'DPI')?.status).toBe('FAIL');
    expect(runPreflight({ ...GOOD_ASSET, dpi: 150 }).rules.find((r) => r.rule === 'DPI')?.status).toBe('WARN');
    expect(runPreflight({ ...GOOD_ASSET, dpi: 300 }).rules.find((r) => r.rule === 'DPI')?.status).toBe('PASS');
  });
});

describe('DIMENSIONS rule', () => {
  it('fails when pixel dimensions are below the minimum-dpi requirement', () => {
    const tooSmall: PreflightAssetInput = { ...GOOD_ASSET, widthPx: 500, heightPx: 600 };
    const rule = runPreflight(tooSmall, FRONT_PRINT_AREA).rules.find((r) => r.rule === 'DIMENSIONS');
    expect(rule?.status).toBe('FAIL');
  });

  it('warns when dimensions clear the minimum but miss the recommended dpi', () => {
    // 12in x 150dpi = 1800px min; 12in x 300dpi = 3600px recommended.
    const midSize: PreflightAssetInput = { ...GOOD_ASSET, widthPx: 2000, heightPx: 2400 };
    const rule = runPreflight(midSize, FRONT_PRINT_AREA).rules.find((r) => r.rule === 'DIMENSIONS');
    expect(rule?.status).toBe('WARN');
  });

  it('warns when width/height metadata is missing', () => {
    const rule = runPreflight({ ...GOOD_ASSET, widthPx: null, heightPx: null }, FRONT_PRINT_AREA).rules.find(
      (r) => r.rule === 'DIMENSIONS',
    );
    expect(rule?.status).toBe('WARN');
  });

  it('is skipped with no print area to check against', () => {
    const rule = runPreflight(GOOD_ASSET).rules.find((r) => r.rule === 'DIMENSIONS');
    expect(rule?.status).toBe('SKIPPED');
  });
});

describe('BLEED_SAFE_AREA rule', () => {
  it('warns when the image lacks pixels for the required bleed margin', () => {
    // Exactly meets the base print area at min dpi but not bleed-inclusive.
    const exact: PreflightAssetInput = { ...GOOD_ASSET, widthPx: 1800, heightPx: 2400 };
    const rule = runPreflight(exact, FRONT_PRINT_AREA).rules.find((r) => r.rule === 'BLEED_SAFE_AREA');
    expect(rule?.status).toBe('WARN');
  });

  it('passes when bleed-inclusive dimensions are covered', () => {
    const rule = runPreflight(GOOD_ASSET, FRONT_PRINT_AREA).rules.find((r) => r.rule === 'BLEED_SAFE_AREA');
    expect(rule?.status).toBe('PASS');
  });

  it('is skipped without a print area (no bleed spec to check)', () => {
    const rule = runPreflight(GOOD_ASSET).rules.find((r) => r.rule === 'BLEED_SAFE_AREA');
    expect(rule?.status).toBe('SKIPPED');
  });
});

describe('COLOR_PROFILE rule', () => {
  it('warns (never fails) on a fixable RGB-vs-CMYK mismatch', () => {
    const rule = runPreflight({ ...GOOD_ASSET, colorProfile: 'RGB' }, FRONT_PRINT_AREA).rules.find(
      (r) => r.rule === 'COLOR_PROFILE',
    );
    expect(rule?.status).toBe('WARN');
  });

  it('warns when the profile is unknown', () => {
    const rule = runPreflight({ ...GOOD_ASSET, colorProfile: 'UNKNOWN' }, FRONT_PRINT_AREA).rules.find(
      (r) => r.rule === 'COLOR_PROFILE',
    );
    expect(rule?.status).toBe('WARN');
  });

  it('passes on a matching profile', () => {
    const rule = runPreflight(GOOD_ASSET, FRONT_PRINT_AREA).rules.find((r) => r.rule === 'COLOR_PROFILE');
    expect(rule?.status).toBe('PASS');
  });

  it('assumes CMYK as the generic default without a print area', () => {
    const rule = runPreflight({ ...GOOD_ASSET, colorProfile: 'RGB' }).rules.find((r) => r.rule === 'COLOR_PROFILE');
    expect(rule?.status).toBe('WARN');
  });
});

describe('TRANSPARENCY rule', () => {
  it('fails transparent art on a print area that forbids transparency', () => {
    const rule = runPreflight({ ...GOOD_ASSET, hasTransparency: true }, FRONT_PRINT_AREA).rules.find(
      (r) => r.rule === 'TRANSPARENCY',
    );
    expect(rule?.status).toBe('FAIL');
  });

  it('passes transparent art when the print area allows it', () => {
    const allowsTransparency: PrintAreaSpec = { ...FRONT_PRINT_AREA, allowsTransparency: true };
    const rule = runPreflight({ ...GOOD_ASSET, hasTransparency: true }, allowsTransparency).rules.find(
      (r) => r.rule === 'TRANSPARENCY',
    );
    expect(rule?.status).toBe('PASS');
  });

  it('warns when transparency metadata is unknown', () => {
    const rule = runPreflight({ ...GOOD_ASSET, hasTransparency: null }, FRONT_PRINT_AREA).rules.find(
      (r) => r.rule === 'TRANSPARENCY',
    );
    expect(rule?.status).toBe('WARN');
  });

  it('is skipped without a print area', () => {
    const rule = runPreflight(GOOD_ASSET).rules.find((r) => r.rule === 'TRANSPARENCY');
    expect(rule?.status).toBe('SKIPPED');
  });
});

describe('MIN_STROKE_WIDTH rule', () => {
  it('is skipped without vector stroke-width metadata', () => {
    const rule = runPreflight({ ...GOOD_ASSET, minStrokeWidthPx: null }, FRONT_PRINT_AREA).rules.find(
      (r) => r.rule === 'MIN_STROKE_WIDTH',
    );
    expect(rule?.status).toBe('SKIPPED');
  });

  it('fails a stroke thinner than 0.5pt', () => {
    // 1px at 300dpi = 0.0033in = 0.24pt, below the 0.5pt hard floor.
    const rule = runPreflight({ ...GOOD_ASSET, minStrokeWidthPx: 1 }, FRONT_PRINT_AREA).rules.find(
      (r) => r.rule === 'MIN_STROKE_WIDTH',
    );
    expect(rule?.status).toBe('FAIL');
  });

  it('warns between 0.5pt and 1pt', () => {
    // 3px at 300dpi = 0.01in = 0.72pt.
    const rule = runPreflight({ ...GOOD_ASSET, minStrokeWidthPx: 3 }, FRONT_PRINT_AREA).rules.find(
      (r) => r.rule === 'MIN_STROKE_WIDTH',
    );
    expect(rule?.status).toBe('WARN');
  });

  it('passes at or above 1pt', () => {
    const rule = runPreflight(GOOD_ASSET, FRONT_PRINT_AREA).rules.find((r) => r.rule === 'MIN_STROKE_WIDTH');
    expect(rule?.status).toBe('PASS');
  });

  it('warns when dpi is unknown so px cannot be converted to real units', () => {
    const rule = runPreflight({ ...GOOD_ASSET, dpi: null, minStrokeWidthPx: 6 }, FRONT_PRINT_AREA).rules.find(
      (r) => r.rule === 'MIN_STROKE_WIDTH',
    );
    expect(rule?.status).toBe('WARN');
    expect(rule?.messageKey).toBe('studio.preflight.rule.minStrokeWidth.unknownDpi');
  });
});
