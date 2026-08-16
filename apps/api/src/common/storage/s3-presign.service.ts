import { Injectable, Logger } from '@nestjs/common';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import { env } from '../../config/env';

export interface PresignedUpload {
  storageKey: string;
  url: string;
  expiresAt: Date;
}

/**
 * Real S3-compatible presigned-PUT generator (featureslist.md 2.1). Presigned
 * URL generation is pure local computation (AWS SigV4 signing) — it needs
 * credentials, not network connectivity, so this produces a genuinely valid,
 * correctly-signed URL even though MinIO/S3 is unreachable in this sandbox.
 * Whether a real browser PUT against that URL actually succeeds has NOT been
 * verified here — see docs/DEBT.md.
 */
@Injectable()
export class S3PresignService {
  private readonly logger = new Logger(S3PresignService.name);
  private readonly client: S3Client;

  constructor() {
    this.client = new S3Client({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      forcePathStyle: true,
      credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
    });
  }

  buildStorageKey(tenantId: string, filename: string, prefix = 'assets'): string {
    const ext = filename.includes('.') ? filename.slice(filename.lastIndexOf('.')) : '';
    return `tenants/${tenantId}/${prefix}/${randomUUID()}${ext}`;
  }

  async presignPut(storageKey: string, contentType: string, ttlSeconds = env.UPLOAD_URL_TTL_SECONDS): Promise<PresignedUpload> {
    const command = new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: storageKey, ContentType: contentType });
    try {
      const url = await getSignedUrl(this.client, command, { expiresIn: ttlSeconds });
      return { storageKey, url, expiresAt: new Date(Date.now() + ttlSeconds * 1000) };
    } catch (error) {
      this.logger.error(`Failed to presign upload for ${storageKey}: ${String(error)}`);
      throw error;
    }
  }

  /**
   * Phase 5 (task 5.10/7.2) — presigned GET for digital-product delivery.
   * Reuses this class's SigV4 client unmodified; the TTL/download-count/IP
   * caps that make this a genuinely "capped" download live one layer up in
   * `DeliveryService`'s `DeliveryToken` bookkeeping (this method alone is
   * just "produce a real, correctly-signed, time-limited GET URL for one
   * object" — the same honest local-computation-only caveat as
   * `presignPut`: real signing, unverified round-trip in this sandbox since
   * no live S3/MinIO endpoint is reachable here).
   */
  async presignGet(storageKey: string, ttlSeconds: number): Promise<{ url: string; expiresAt: Date }> {
    const command = new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: storageKey });
    const url = await getSignedUrl(this.client, command, { expiresIn: ttlSeconds });
    return { url, expiresAt: new Date(Date.now() + ttlSeconds * 1000) };
  }
}
