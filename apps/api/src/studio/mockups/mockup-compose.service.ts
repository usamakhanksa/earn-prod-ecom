import { Injectable } from '@nestjs/common';
import sharp from 'sharp';

export interface ComposeSpec {
  sceneBuffer: Buffer;
  designBuffer: Buffer;
  printAreaX: number;
  printAreaY: number;
  printAreaWidth: number;
  printAreaHeight: number;
  rotationDeg?: number;
}

/**
 * Synchronous, sharp-based mockup compositing (featureslist.md 2.9,
 * implentationplanphase.md task 2.5). Resizes the design to fit the
 * template's print-area bounds, applies rotation, centres it within the
 * bounds, and composites onto the scene image — real code, runnable without
 * any queue. The batch/async render path (many colourways/scenes at once)
 * needs BullMQ/Redis (unavailable this phase) — see `MockupRenderQueue` for
 * that seam, and docs/DEBT.md for why it isn't wired to a real worker yet.
 */
@Injectable()
export class MockupComposeService {
  async compose(spec: ComposeSpec): Promise<Buffer> {
    let design = sharp(spec.designBuffer).resize(spec.printAreaWidth, spec.printAreaHeight, {
      fit: 'inside',
      withoutEnlargement: true,
    });
    if (spec.rotationDeg !== undefined && spec.rotationDeg !== 0) {
      design = design.rotate(spec.rotationDeg, { background: { r: 0, g: 0, b: 0, alpha: 0 } });
    }
    const designBuffer = await design.png().toBuffer();
    const designMeta = await sharp(designBuffer).metadata();
    const designWidth = designMeta.width ?? spec.printAreaWidth;
    const designHeight = designMeta.height ?? spec.printAreaHeight;

    const offsetX = spec.printAreaX + Math.max(0, Math.round((spec.printAreaWidth - designWidth) / 2));
    const offsetY = spec.printAreaY + Math.max(0, Math.round((spec.printAreaHeight - designHeight) / 2));

    return sharp(spec.sceneBuffer)
      .composite([{ input: designBuffer, left: offsetX, top: offsetY }])
      .png()
      .toBuffer();
  }
}

/**
 * Batch/async render queue interface (featureslist.md 2.9 "batch render").
 * `NoopMockupRenderQueue` is the only implementation this phase ships — it
 * documents the gap rather than faking a worker that cannot actually run
 * without Redis/BullMQ (docs/DEBT.md). A real BullMQ-backed implementation
 * lands with Phase 3's queue topology.
 */
export interface MockupRenderQueue {
  enqueue(renderId: string): Promise<{ queued: boolean }>;
}

export class NoopMockupRenderQueue implements MockupRenderQueue {
  async enqueue(_renderId: string): Promise<{ queued: boolean }> {
    // Intentionally not queued — no BullMQ/Redis in this environment. Callers
    // must run MockupComposeService.compose() synchronously instead (the only
    // path AssetsController/MockupsController actually exposes this phase).
    return { queued: false };
  }
}
