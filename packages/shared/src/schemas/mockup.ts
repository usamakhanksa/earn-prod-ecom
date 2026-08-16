import { z } from 'zod';

/**
 * Mockup generator (featureslist.md 2.9, implentationplanphase.md task 2.5).
 * Synchronous single-mockup compositing (sharp-based) is real and runnable
 * without any queue infra — see apps/api/src/studio/mockups. Batch/async
 * rendering needs BullMQ/Redis, unavailable this phase (docs/DEBT.md); the
 * `MockupRenderQueue` interface exists as a seam, backed by a no-op adapter.
 */

export const composeMockupSchema = z.object({
  templateId: z.string().min(1),
  assetId: z.string().min(1),
});
export type ComposeMockupInput = z.infer<typeof composeMockupSchema>;

export interface MockupTemplateSummary {
  id: string;
  blueprintId: string | null;
  placementCode: string;
  name: string;
  sceneKey: string;
  sceneWidthPx: number;
  sceneHeightPx: number;
  printAreaX: number;
  printAreaY: number;
  printAreaWidth: number;
  printAreaHeight: number;
  rotationDeg: number;
  colorway: string | null;
}

export interface MockupRenderSummary {
  id: string;
  templateId: string;
  assetId: string;
  outputKey: string | null;
  status: string;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}
