import type { PreflightAssetInput, PreflightReportResult, PreflightRuleResult, PrintAreaSpec } from '@omnisell/shared';
import { PREFLIGHT_MAX_FILE_SIZE_MB_DEFAULT } from '@omnisell/shared';

/**
 * Print-file preflight engine (featureslist.md 2.7, implentationplanphase.md
 * task 2.4). Pure, synchronous, no infra dependency — the best-tested surface
 * of this phase by design (prompt.md instructs exactly that for a rule engine
 * this cheap to verify). Every rule takes the asset's known metadata plus an
 * OPTIONAL blueprint print-area spec; without a spec, rules that are
 * inherently blueprint-relative report `SKIPPED` rather than guessing.
 *
 * Generic fallback thresholds (used only when no print-area spec is supplied,
 * e.g. checking an asset before it's mapped to any product yet):
 *  - DPI: 100 hard floor, 300 recommended (standard print convention).
 *  - Minimum stroke weight: 0.5pt hard floor, 1pt recommended (~0.007in /
 *    0.014in) — the commonly cited minimum line weight for offset/DTG print.
 */
const GENERIC_DPI_MIN = 100;
const GENERIC_DPI_RECOMMENDED = 300;
const MIN_STROKE_IN_HARD_FLOOR = 0.5 / 72; // 0.5pt
const MIN_STROKE_IN_RECOMMENDED = 1 / 72; // 1pt

export function runPreflight(asset: PreflightAssetInput, printArea?: PrintAreaSpec): PreflightReportResult {
  const rules: PreflightRuleResult[] = [
    checkFileSize(asset, printArea),
    checkDpi(asset, printArea),
    checkDimensions(asset, printArea),
    checkBleedSafeArea(asset, printArea),
    checkColorProfile(asset, printArea),
    checkTransparency(asset, printArea),
    checkMinStrokeWidth(asset),
  ];

  const overallStatus = rules.some((r) => r.status === 'FAIL')
    ? 'FAIL'
    : rules.some((r) => r.status === 'WARN')
      ? 'WARN'
      : 'PASS';

  return { overallStatus, rules };
}

function checkFileSize(asset: PreflightAssetInput, printArea?: PrintAreaSpec): PreflightRuleResult {
  const ceilingMb = printArea?.maxFileSizeMb ?? PREFLIGHT_MAX_FILE_SIZE_MB_DEFAULT;
  const sizeMb = asset.sizeBytes / (1024 * 1024);
  if (sizeMb > ceilingMb) {
    return {
      rule: 'FILE_SIZE',
      status: 'FAIL',
      messageKey: 'studio.preflight.rule.fileSize.fail',
      params: { sizeMb: round1(sizeMb), ceilingMb },
    };
  }
  return {
    rule: 'FILE_SIZE',
    status: 'PASS',
    messageKey: 'studio.preflight.rule.fileSize.pass',
    params: { sizeMb: round1(sizeMb), ceilingMb },
  };
}

function checkDpi(asset: PreflightAssetInput, printArea?: PrintAreaSpec): PreflightRuleResult {
  if (asset.dpi === null) {
    return { rule: 'DPI', status: 'WARN', messageKey: 'studio.preflight.rule.dpi.unknown' };
  }
  const dpiMin = printArea?.dpiMin ?? GENERIC_DPI_MIN;
  const dpiRecommended = printArea?.dpiRecommended ?? GENERIC_DPI_RECOMMENDED;
  if (asset.dpi < dpiMin) {
    return { rule: 'DPI', status: 'FAIL', messageKey: 'studio.preflight.rule.dpi.fail', params: { dpi: asset.dpi, dpiMin } };
  }
  if (asset.dpi < dpiRecommended) {
    return {
      rule: 'DPI',
      status: 'WARN',
      messageKey: 'studio.preflight.rule.dpi.warnLow',
      params: { dpi: asset.dpi, dpiRecommended },
    };
  }
  return { rule: 'DPI', status: 'PASS', messageKey: 'studio.preflight.rule.dpi.pass', params: { dpi: asset.dpi } };
}

function checkDimensions(asset: PreflightAssetInput, printArea?: PrintAreaSpec): PreflightRuleResult {
  if (printArea === undefined) {
    return { rule: 'DIMENSIONS', status: 'SKIPPED', messageKey: 'studio.preflight.rule.dimensions.skipped' };
  }
  if (asset.widthPx === null || asset.heightPx === null) {
    return { rule: 'DIMENSIONS', status: 'WARN', messageKey: 'studio.preflight.rule.dimensions.unknown' };
  }
  const minWidthPx = printArea.widthIn * printArea.dpiMin;
  const minHeightPx = printArea.heightIn * printArea.dpiMin;
  const recommendedWidthPx = printArea.widthIn * printArea.dpiRecommended;
  const recommendedHeightPx = printArea.heightIn * printArea.dpiRecommended;

  if (asset.widthPx < minWidthPx || asset.heightPx < minHeightPx) {
    return {
      rule: 'DIMENSIONS',
      status: 'FAIL',
      messageKey: 'studio.preflight.rule.dimensions.fail',
      params: {
        widthPx: asset.widthPx,
        heightPx: asset.heightPx,
        minWidthPx: Math.round(minWidthPx),
        minHeightPx: Math.round(minHeightPx),
      },
    };
  }
  if (asset.widthPx < recommendedWidthPx || asset.heightPx < recommendedHeightPx) {
    return {
      rule: 'DIMENSIONS',
      status: 'WARN',
      messageKey: 'studio.preflight.rule.dimensions.warnLow',
      params: {
        widthPx: asset.widthPx,
        heightPx: asset.heightPx,
        recommendedWidthPx: Math.round(recommendedWidthPx),
        recommendedHeightPx: Math.round(recommendedHeightPx),
      },
    };
  }
  return {
    rule: 'DIMENSIONS',
    status: 'PASS',
    messageKey: 'studio.preflight.rule.dimensions.pass',
    params: { widthPx: asset.widthPx, heightPx: asset.heightPx },
  };
}

function checkBleedSafeArea(asset: PreflightAssetInput, printArea?: PrintAreaSpec): PreflightRuleResult {
  if (printArea === undefined) {
    return { rule: 'BLEED_SAFE_AREA', status: 'SKIPPED', messageKey: 'studio.preflight.rule.bleedSafeArea.skipped' };
  }
  if (asset.widthPx === null || asset.heightPx === null) {
    return { rule: 'BLEED_SAFE_AREA', status: 'WARN', messageKey: 'studio.preflight.rule.bleedSafeArea.unknown' };
  }
  const requiredWidthPx = (printArea.widthIn + printArea.bleedIn * 2) * printArea.dpiMin;
  const requiredHeightPx = (printArea.heightIn + printArea.bleedIn * 2) * printArea.dpiMin;
  if (asset.widthPx < requiredWidthPx || asset.heightPx < requiredHeightPx) {
    return {
      rule: 'BLEED_SAFE_AREA',
      status: 'WARN', // auto-fixable by adding bleed (2.8 auto-fix suggestion), never a hard FAIL on its own
      messageKey: 'studio.preflight.rule.bleedSafeArea.warn',
      params: {
        bleedIn: printArea.bleedIn,
        requiredWidthPx: Math.round(requiredWidthPx),
        requiredHeightPx: Math.round(requiredHeightPx),
      },
    };
  }
  return {
    rule: 'BLEED_SAFE_AREA',
    status: 'PASS',
    messageKey: 'studio.preflight.rule.bleedSafeArea.pass',
    params: { bleedIn: printArea.bleedIn },
  };
}

function checkColorProfile(asset: PreflightAssetInput, printArea?: PrintAreaSpec): PreflightRuleResult {
  const required = printArea?.colorProfile ?? 'CMYK';
  if (asset.colorProfile === null || asset.colorProfile === 'UNKNOWN') {
    return { rule: 'COLOR_PROFILE', status: 'WARN', messageKey: 'studio.preflight.rule.colorProfile.unknown', params: { required } };
  }
  if (asset.colorProfile !== required) {
    // Never a hard FAIL: a profile mismatch is auto-fixable via conversion
    // (2.8 auto-fix suggestions), so it's a quality warning, not a blocker.
    return {
      rule: 'COLOR_PROFILE',
      status: 'WARN',
      messageKey: 'studio.preflight.rule.colorProfile.warn',
      params: { actual: asset.colorProfile, required },
    };
  }
  return { rule: 'COLOR_PROFILE', status: 'PASS', messageKey: 'studio.preflight.rule.colorProfile.pass', params: { profile: asset.colorProfile } };
}

function checkTransparency(asset: PreflightAssetInput, printArea?: PrintAreaSpec): PreflightRuleResult {
  if (printArea === undefined) {
    return { rule: 'TRANSPARENCY', status: 'SKIPPED', messageKey: 'studio.preflight.rule.transparency.skipped' };
  }
  if (asset.hasTransparency === null) {
    return { rule: 'TRANSPARENCY', status: 'WARN', messageKey: 'studio.preflight.rule.transparency.unknown' };
  }
  if (asset.hasTransparency && !printArea.allowsTransparency) {
    return { rule: 'TRANSPARENCY', status: 'FAIL', messageKey: 'studio.preflight.rule.transparency.fail' };
  }
  return { rule: 'TRANSPARENCY', status: 'PASS', messageKey: 'studio.preflight.rule.transparency.pass' };
}

function checkMinStrokeWidth(asset: PreflightAssetInput): PreflightRuleResult {
  if (asset.minStrokeWidthPx === null) {
    return { rule: 'MIN_STROKE_WIDTH', status: 'SKIPPED', messageKey: 'studio.preflight.rule.minStrokeWidth.skipped' };
  }
  if (asset.dpi === null) {
    return { rule: 'MIN_STROKE_WIDTH', status: 'WARN', messageKey: 'studio.preflight.rule.minStrokeWidth.unknownDpi' };
  }
  const strokeIn = asset.minStrokeWidthPx / asset.dpi;
  if (strokeIn < MIN_STROKE_IN_HARD_FLOOR) {
    return {
      rule: 'MIN_STROKE_WIDTH',
      status: 'FAIL',
      messageKey: 'studio.preflight.rule.minStrokeWidth.fail',
      params: { strokePt: round2(strokeIn * 72) },
    };
  }
  if (strokeIn < MIN_STROKE_IN_RECOMMENDED) {
    return {
      rule: 'MIN_STROKE_WIDTH',
      status: 'WARN',
      messageKey: 'studio.preflight.rule.minStrokeWidth.warn',
      params: { strokePt: round2(strokeIn * 72) },
    };
  }
  return { rule: 'MIN_STROKE_WIDTH', status: 'PASS', messageKey: 'studio.preflight.rule.minStrokeWidth.pass', params: { strokePt: round2(strokeIn * 72) } };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
