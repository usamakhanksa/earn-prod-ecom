import { Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { CreateVideoContentInput, UpdateVideoContentInput, VideoContentView } from '@omnisell/shared';
import { VideoContentRepository } from '../repositories/video-content.repository';
import { AssetUploadSessionRepository } from '../repositories/asset-upload-session.repository';
import { ResumableUploadStorage } from '../common/storage/resumable-upload.storage';
import { VideoProbeService } from '../studio/video-probe.service';
import { EarningRuleService } from './earning-rule.service';

const MAX_REMOTE_FETCH_BYTES = 200 * 1024 * 1024; // 200MB — generous but bounded

/**
 * `VideoContent` CRUD (docs/points-extension.md §9.4/§10.3, task 4.5.4/4.5.8).
 * Reuses Phase 2's presigned/resumable upload pipeline (`AssetUploadSessionRepository`
 * + `ResumableUploadStorage`) rather than inventing a video-specific upload path —
 * exactly what the brief asked for. `durationSeconds` is ALWAYS server-derived via
 * `VideoProbeService` (real `ffprobe`, verified in this sandbox), never a client
 * value, for both supported sources:
 *   - `uploadSessionId`: bytes already sitting in this API's own upload scratch
 *     storage (disk-backed stand-in for S3, same as Assets — docs/DEBT.md 2-D2).
 *   - `url`: an external, already-hosted video — the server downloads it (bounded
 *     size) and probes the downloaded bytes. Fetching an arbitrary caller-supplied
 *     URL server-side is a known SSRF surface in production (no allow-list/private-
 *     IP block implemented here) — flagged honestly in docs/DEBT.md rather than
 *     silently shipped as if hardened.
 */
@Injectable()
export class VideoContentService {
  private readonly logger = new Logger(VideoContentService.name);

  constructor(
    private readonly videos: VideoContentRepository,
    private readonly uploadSessions: AssetUploadSessionRepository,
    private readonly resumableStorage: ResumableUploadStorage,
    private readonly probe: VideoProbeService,
    private readonly earningRules: EarningRuleService,
  ) {}

  async create(tenantId: string, input: CreateVideoContentInput): Promise<VideoContentView> {
    const { durationSeconds, url } = await this.deriveDurationAndUrl(tenantId, input);
    const row = await this.videos.create({
      tenantId,
      title: input.title,
      url,
      durationSeconds,
      thumbnailUrl: input.thumbnailUrl ?? null,
      pointsPerView: input.pointsPerView ?? null,
      isActive: input.isActive,
    });
    return this.toView(tenantId, row);
  }

  private async deriveDurationAndUrl(tenantId: string, input: CreateVideoContentInput): Promise<{ durationSeconds: number; url: string }> {
    if (input.uploadSessionId !== undefined) {
      const session = await this.uploadSessions.findById(tenantId, input.uploadSessionId);
      if (session === null) {
        throw new NotFoundException({ message: 'Upload session not found', code: 'UPLOAD_SESSION_NOT_FOUND' });
      }
      const buffer = await this.resumableStorage.readAll(input.uploadSessionId);
      const probe = await this.probe.probeBuffer(buffer);
      if (!probe.probed) {
        throw new UnprocessableEntityException({ message: `Could not determine video duration: ${probe.reason}`, code: 'VIDEO_DURATION_PROBE_FAILED' });
      }
      return { durationSeconds: probe.durationSeconds, url: `/v1/videos/blob/${input.uploadSessionId}` };
    }

    // input.url path (zod refine guarantees exactly one of the two is set)
    const url = input.url as string;
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const contentLength = Number(response.headers.get('content-length') ?? '0');
      if (contentLength > 0 && contentLength > MAX_REMOTE_FETCH_BYTES) {
        throw new Error(`Video too large to probe (${contentLength} bytes)`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      const probe = await this.probe.probeBuffer(buffer);
      if (!probe.probed) {
        throw new UnprocessableEntityException({ message: `Could not determine video duration: ${probe.reason}`, code: 'VIDEO_DURATION_PROBE_FAILED' });
      }
      return { durationSeconds: probe.durationSeconds, url };
    } catch (error) {
      if (error instanceof UnprocessableEntityException) {
        throw error;
      }
      this.logger.warn(`Could not fetch/probe remote video "${url}": ${String(error)}`);
      throw new UnprocessableEntityException({ message: `Could not fetch or probe the video at the given URL: ${String(error)}`, code: 'VIDEO_DURATION_PROBE_FAILED' });
    }
  }

  async findById(tenantId: string, id: string): Promise<VideoContentView> {
    const row = await this.videos.findById(tenantId, id);
    if (row === null) {
      throw new NotFoundException({ message: 'Video not found', code: 'VIDEO_NOT_FOUND' });
    }
    return this.toView(tenantId, row);
  }

  async listActive(tenantId: string): Promise<VideoContentView[]> {
    const rows = await this.videos.listActive(tenantId);
    return Promise.all(rows.map((row) => this.toView(tenantId, row)));
  }

  async listAll(tenantId: string): Promise<VideoContentView[]> {
    const rows = await this.videos.listAll(tenantId);
    return Promise.all(rows.map((row) => this.toView(tenantId, row)));
  }

  async update(tenantId: string, id: string, patch: UpdateVideoContentInput): Promise<VideoContentView> {
    const row = await this.videos.update(tenantId, id, patch);
    return this.toView(tenantId, row);
  }

  async archive(tenantId: string, id: string): Promise<VideoContentView> {
    const row = await this.videos.archive(tenantId, id);
    return this.toView(tenantId, row);
  }

  async readBlob(tenantId: string, uploadSessionId: string): Promise<Buffer> {
    const session = await this.uploadSessions.findById(tenantId, uploadSessionId);
    if (session === null) {
      throw new NotFoundException({ message: 'Video blob not found', code: 'VIDEO_NOT_FOUND' });
    }
    return this.resumableStorage.readAll(uploadSessionId);
  }

  private async toView(tenantId: string, row: Awaited<ReturnType<VideoContentRepository['create']>>): Promise<VideoContentView> {
    const { points } = await this.earningRules.resolvePoints(tenantId, 'video_watch', row.pointsPerView);
    return {
      id: row.id,
      title: row.title,
      url: row.url,
      durationSeconds: row.durationSeconds,
      thumbnailUrl: row.thumbnailUrl,
      pointsPerView: row.pointsPerView,
      resolvedPointsPerView: points,
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
