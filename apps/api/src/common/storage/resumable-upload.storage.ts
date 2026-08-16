import { Injectable } from '@nestjs/common';
import { appendFile, mkdir, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from '../../config/env';

/**
 * Disk-backed stand-in for a tus resumable-upload server (featureslist.md
 * 2.2). Tracks byte offset exactly like a real tus PATCH endpoint would — the
 * offset-tracking contract (`AssetUploadSession.receivedBytes`) is real and
 * retry-safe; only the chunk-bytes DESTINATION is a stand-in, because no live
 * MinIO/S3 endpoint exists in this sandbox (docs/DEBT.md). A production swap
 * to S3 multipart upload only touches `appendChunk`/`readAll`/`cleanup` — the
 * session/offset model above it does not change.
 */
@Injectable()
export class ResumableUploadStorage {
  private readonly scratchDir = env.ASSET_UPLOAD_SCRATCH_DIR;

  private pathFor(sessionId: string): string {
    return join(this.scratchDir, `${sessionId}.part`);
  }

  private async ensureDir(): Promise<void> {
    await mkdir(this.scratchDir, { recursive: true });
  }

  async appendChunk(sessionId: string, chunk: Buffer): Promise<number> {
    await this.ensureDir();
    await appendFile(this.pathFor(sessionId), chunk);
    const info = await stat(this.pathFor(sessionId));
    return info.size;
  }

  async readAll(sessionId: string): Promise<Buffer> {
    return readFile(this.pathFor(sessionId));
  }

  async cleanup(sessionId: string): Promise<void> {
    await rm(this.pathFor(sessionId), { force: true });
  }
}
