import { Injectable } from '@nestjs/common';
import type { PreflightAssetInput, PreflightReportResult, PrintAreaSpec } from '@omnisell/shared';
import { runPreflight } from './preflight.engine';

/** Thin injectable wrapper around the pure `runPreflight` engine so callers
 * (AssetsService) depend on a DI token rather than a bare function import —
 * matches this codebase's convention of engine-as-service even when the core
 * logic is pure (see also PricingService/MarginService). */
@Injectable()
export class PreflightService {
  run(asset: PreflightAssetInput, printArea?: PrintAreaSpec): PreflightReportResult {
    return runPreflight(asset, printArea);
  }
}
