import { Injectable } from '@nestjs/common';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from '../../config/env';

/**
 * Local-disk storage for a generated Export Pack ZIP (task 4.12) — same
 * documented stand-in pattern as `ResumableUploadStorage` (docs/DEBT.md
 * 2-D2), except here it is the pack's own OUTPUT artifact rather than a
 * source upload, so `GET /export-packs/:id/download` can genuinely complete
 * end-to-end in this sandbox even though the SOURCE asset bytes it was built
 * from may not be fetchable (see `ExportPackGeneratorService`'s doc comment).
 */
@Injectable()
export class ExportPackStorage {
  private readonly scratchDir = env.EXPORT_PACK_SCRATCH_DIR;

  private pathFor(exportPackId: string): string {
    return join(this.scratchDir, `${exportPackId}.zip`);
  }

  async save(exportPackId: string, zip: Buffer): Promise<string> {
    await mkdir(this.scratchDir, { recursive: true });
    const path = this.pathFor(exportPackId);
    await writeFile(path, zip);
    return path;
  }

  async read(exportPackId: string): Promise<Buffer> {
    return readFile(this.pathFor(exportPackId));
  }

  async remove(exportPackId: string): Promise<void> {
    await rm(this.pathFor(exportPackId), { force: true });
  }
}
