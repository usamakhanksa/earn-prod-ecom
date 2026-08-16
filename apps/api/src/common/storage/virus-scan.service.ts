import { Injectable, Logger } from '@nestjs/common';

export interface VirusScanResult {
  clean: boolean;
  engine: string;
  scannedAt: string;
}

/**
 * Virus-scan hook (featureslist.md 2.1 — "virus scan hook"). No ClamAV (or
 * equivalent) daemon is reachable in this sandbox, so this is honestly a
 * no-op that always reports `clean: true` with an explicit `engine: 'none'`
 * marker — callers must not mistake this for a real scan result. Wiring a
 * real `clamd` TCP/socket client (or an S3-event-triggered Lambda scanner in
 * a cloud deployment) is a real seam to fill in once a scanner is available,
 * not a design this class needs to change for.
 */
@Injectable()
export class VirusScanService {
  private readonly logger = new Logger(VirusScanService.name);

  async scan(buffer: Buffer, filename: string): Promise<VirusScanResult> {
    this.logger.debug(`Virus scan hook called for '${filename}' (${buffer.length} bytes) — no scanner configured in this environment`);
    return { clean: true, engine: 'none (no scanner available in this sandbox)', scannedAt: new Date().toISOString() };
  }
}
