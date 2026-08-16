import { describe, expect, it } from 'vitest';
import { VirusScanService } from '../src/common/storage/virus-scan.service';

describe('VirusScanService', () => {
  it('reports clean with an explicit "no scanner" engine marker (docs/DEBT.md)', async () => {
    const service = new VirusScanService();
    const result = await service.scan(Buffer.from('hello'), 'design.png');
    expect(result.clean).toBe(true);
    expect(result.engine).toContain('none');
    expect(() => new Date(result.scannedAt).toISOString()).not.toThrow();
  });
});
