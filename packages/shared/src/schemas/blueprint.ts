import type { PrintAreaSpec } from './preflight';

/**
 * Blueprint = provider catalog CACHE (prompt.md data model). No live connector
 * sync exists yet (docs/DEBT.md 0-D8, Phase 3 scope) — rows are hand-seeded
 * this phase (implentationplanphase.md task 2.6). Read-only from the API
 * surface this phase; a real `POST /blueprints/sync` job lands with Phase 3's
 * connector adapters.
 */

export interface BlueprintColor {
  name: string;
  hex: string;
}

export interface BlueprintSummary {
  id: string;
  providerSlug: string;
  providerBlueprintId: string;
  name: string;
  category: string;
  printAreas: PrintAreaSpec[];
  sizes: string[];
  colors: BlueprintColor[];
  isActive: boolean;
  syncedAt: string;
}

export interface BlueprintVariantSummary {
  id: string;
  blueprintId: string;
  providerVariantId: string;
  size: string;
  color: string;
  colorHex: string | null;
  sku: string | null;
  baseCostMinor: string;
  currency: string;
  inStock: boolean;
}
