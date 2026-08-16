import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { MockupComposeService, NoopMockupRenderQueue } from '../src/studio/mockups/mockup-compose.service';

async function solid(width: number, height: number, r: number, g: number, b: number, alpha = 1): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 4, background: { r, g, b, alpha } } })
    .png()
    .toBuffer();
}

describe('MockupComposeService.compose', () => {
  const service = new MockupComposeService();

  it('composites the design onto the scene at the print-area bounds', async () => {
    const scene = await solid(1000, 1000, 255, 255, 255);
    const design = await solid(400, 400, 255, 0, 0, 1);

    const result = await service.compose({
      sceneBuffer: scene,
      designBuffer: design,
      printAreaX: 300,
      printAreaY: 300,
      printAreaWidth: 400,
      printAreaHeight: 400,
    });

    const meta = await sharp(result).metadata();
    expect(meta.width).toBe(1000);
    expect(meta.height).toBe(1000);

    // Sample a pixel inside the print area — should be the design's red, not the scene's white.
    const { data, info } = await sharp(result).raw().toBuffer({ resolveWithObject: true });
    const x = 500;
    const y = 500;
    const idx = (y * info.width + x) * info.channels;
    expect(data[idx]).toBeGreaterThan(200); // red channel
    expect(data[idx + 1]).toBeLessThan(50); // green channel near zero
  });

  it('shrinks a design larger than the print area to fit', async () => {
    const scene = await solid(500, 500, 255, 255, 255);
    const design = await solid(2000, 2000, 0, 0, 255);

    const result = await service.compose({
      sceneBuffer: scene,
      designBuffer: design,
      printAreaX: 0,
      printAreaY: 0,
      printAreaWidth: 200,
      printAreaHeight: 200,
    });
    const meta = await sharp(result).metadata();
    expect(meta.width).toBe(500); // scene canvas size is preserved
  });

  it('applies rotation without throwing', async () => {
    const scene = await solid(300, 300, 255, 255, 255);
    const design = await solid(100, 60, 0, 255, 0);

    await expect(
      service.compose({
        sceneBuffer: scene,
        designBuffer: design,
        printAreaX: 50,
        printAreaY: 50,
        printAreaWidth: 150,
        printAreaHeight: 150,
        rotationDeg: 15,
      }),
    ).resolves.toBeInstanceOf(Buffer);
  });
});

describe('NoopMockupRenderQueue', () => {
  it('honestly reports that nothing was queued (no BullMQ/Redis available)', async () => {
    const queue = new NoopMockupRenderQueue();
    const result = await queue.enqueue('render-1');
    expect(result.queued).toBe(false);
  });
});
