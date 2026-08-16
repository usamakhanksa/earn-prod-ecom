import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import type { ActivateLicenceKeyInput, DeactivateLicenceKeyInput, GenerateLicenceKeysInput, LicenceKeyView } from '@omnisell/shared';
import { LicenceKeyRepository } from '../repositories/licence-key.repository';
import { DigitalProductRepository } from '../repositories/digital-product.repository';

const ALPHANUMERIC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I — avoids ambiguous characters

/** Licence keys: pattern-configurable generation, activation limits, revoke
 * (featureslist.md 7.3, task 5.11). */
@Injectable()
export class LicenceKeyService {
  constructor(
    private readonly repo: LicenceKeyRepository,
    private readonly digitalProducts: DigitalProductRepository,
  ) {}

  async generate(tenantId: string, input: GenerateLicenceKeysInput): Promise<LicenceKeyView[]> {
    const product = await this.digitalProducts.findById(tenantId, input.digitalProductId);
    if (product === null) {
      throw new NotFoundException({ message: 'Digital product not found', code: 'DIGITAL_PRODUCT_NOT_FOUND' });
    }
    const results: LicenceKeyView[] = [];
    for (let i = 0; i < input.count; i += 1) {
      let keyValue = renderPattern(input.pattern);
      // Extremely unlikely collision given the alphabet size, but real
      // uniqueness is still enforced at the DB layer (`@@unique([tenantId,
      // keyValue])`) — retry on the rare clash rather than trusting entropy alone.
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const existing = await this.repo.findByValue(tenantId, keyValue);
        if (existing === null) break;
        keyValue = renderPattern(input.pattern);
      }
      const row = await this.repo.create({
        tenantId,
        digitalProductId: input.digitalProductId,
        entitlementId: input.entitlementId ?? null,
        keyValue,
        activationLimit: input.activationLimit,
        status: 'ACTIVE',
      });
      results.push(toView(row));
    }
    return results;
  }

  async list(tenantId: string, digitalProductId: string): Promise<LicenceKeyView[]> {
    const rows = await this.repo.listForDigitalProduct(tenantId, digitalProductId);
    return rows.map(toView);
  }

  async revoke(tenantId: string, id: string): Promise<LicenceKeyView> {
    const row = await this.repo.update(tenantId, id, { status: 'REVOKED', revokedAt: new Date() });
    if (row === null) {
      throw new NotFoundException({ message: 'Licence key not found', code: 'LICENCE_KEY_NOT_FOUND' });
    }
    return toView(row);
  }

  async activate(tenantId: string, input: ActivateLicenceKeyInput) {
    const key = await this.repo.findByValue(tenantId, input.keyValue);
    if (key === null) {
      throw new NotFoundException({ message: 'Licence key not found', code: 'LICENCE_KEY_NOT_FOUND' });
    }
    if (key.status !== 'ACTIVE') {
      throw new ConflictException({ message: 'This licence key has been revoked', code: 'LICENCE_KEY_REVOKED' });
    }
    const existingActivation = await this.repo.findActivation(key.id, input.deviceId);
    if (existingActivation !== null && existingActivation.deactivatedAt === null) {
      return existingActivation; // idempotent re-activation of the same device
    }
    if (key.activationCount >= key.activationLimit) {
      throw new ConflictException({ message: 'Activation limit reached for this licence key', code: 'LICENCE_KEY_ACTIVATION_LIMIT' });
    }
    const activation = await this.repo.createActivation({ tenantId, licenceKeyId: key.id, deviceId: input.deviceId, deviceLabel: input.deviceLabel ?? null });
    await this.repo.update(tenantId, key.id, { activationCount: { increment: 1 } as never });
    return activation;
  }

  async deactivate(tenantId: string, input: DeactivateLicenceKeyInput) {
    const key = await this.repo.findByValue(tenantId, input.keyValue);
    if (key === null) {
      throw new NotFoundException({ message: 'Licence key not found', code: 'LICENCE_KEY_NOT_FOUND' });
    }
    const activation = await this.repo.findActivation(key.id, input.deviceId);
    if (activation === null || activation.deactivatedAt !== null) {
      throw new NotFoundException({ message: 'No active activation found for this device', code: 'LICENCE_ACTIVATION_NOT_FOUND' });
    }
    await this.repo.deactivate(tenantId, activation.id);
    await this.repo.update(tenantId, key.id, { activationCount: { decrement: 1 } as never });
    return { ok: true };
  }
}

function renderPattern(pattern: string): string {
  let out = '';
  for (const ch of pattern) {
    out += ch === 'X' ? ALPHANUMERIC[randomInt(ALPHANUMERIC.length)] : ch;
  }
  return out;
}

function toView(row: { id: string; keyValue: string; digitalProductId: string; activationLimit: number; activationCount: number; status: string; createdAt: Date }): LicenceKeyView {
  return { id: row.id, keyValue: row.keyValue, digitalProductId: row.digitalProductId, activationLimit: row.activationLimit, activationCount: row.activationCount, status: row.status, createdAt: row.createdAt.toISOString() };
}
