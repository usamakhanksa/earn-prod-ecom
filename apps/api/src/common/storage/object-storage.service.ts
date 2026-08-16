import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { env } from '../../config/env';

/**
 * Real S3-compatible GetObject/PutObject calls (as opposed to
 * `S3PresignService`'s pure local SigV4 URL signing). These need actual
 * network connectivity to MinIO/S3, which this sandbox does not have
 * (docs/DEBT.md) — every call here is expected to fail with a network error
 * in THIS environment. The failure path is handled honestly: a clear 503
 * problem-detail, never fabricated bytes standing in for a real object.
 */
@Injectable()
export class ObjectStorageService {
  private readonly logger = new Logger(ObjectStorageService.name);
  private readonly client: S3Client;

  constructor() {
    this.client = new S3Client({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      forcePathStyle: true,
      credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
    });
  }

  async getObject(storageKey: string): Promise<Buffer> {
    try {
      const result = await this.client.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: storageKey }));
      const bytes = await result.Body?.transformToByteArray();
      if (bytes === undefined) {
        throw new Error('Empty object body');
      }
      return Buffer.from(bytes);
    } catch (error) {
      this.logger.warn(`Object storage unreachable for GetObject(${storageKey}): ${String(error)}`);
      throw new ServiceUnavailableException({
        message: `Object storage is unreachable in this environment — cannot fetch ${storageKey}`,
        code: 'object_storage_unreachable',
      });
    }
  }

  async putObject(storageKey: string, body: Buffer, contentType: string): Promise<void> {
    try {
      await this.client.send(new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: storageKey, Body: body, ContentType: contentType }));
    } catch (error) {
      this.logger.warn(`Object storage unreachable for PutObject(${storageKey}): ${String(error)}`);
      throw new ServiceUnavailableException({
        message: `Object storage is unreachable in this environment — cannot store ${storageKey}`,
        code: 'object_storage_unreachable',
      });
    }
  }
}
