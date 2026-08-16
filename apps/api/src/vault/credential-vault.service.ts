import { Injectable, Logger } from '@nestjs/common';
import { decryptSecret, encryptSecret, generateDek, maskSecret, rewrapDek, unwrapDek, wrapDek } from '@omnisell/connectors';
import { TenantDataKeyRepository } from '../repositories/tenant-data-key.repository';
import { env } from '../config/env';

/** Identifies which literal `KMS_MASTER_KEY` value wrapped a given
 * `TenantDataKey` row — bumped only when the env var's value is rotated.
 * A real KMS (AWS KMS, GCP KMS, HashiCorp Vault) would hand this back from
 * the wrap call itself; env.ts's single static secret needs a manual
 * version tag instead. */
const CURRENT_KMS_KEY_ID = 'env-v1';

/**
 * Credential vault service (prompt.md constraint #3 / implentationplanphase.md
 * task 3.2). The ONLY place in `apps/api` that ever holds a plaintext secret,
 * and only for the duration of one method call — callers receive plaintext
 * back from `decrypt()` and must not log it, return it in an HTTP response
 * body, or pass it anywhere but straight into a `Ctx` for one adapter call.
 *
 * Envelope encryption (packages/connectors/src/vault/envelope.ts does the
 * actual crypto — this service is the Prisma-aware wrapper around it):
 *  - Each tenant gets exactly one `TenantDataKey` row: a random 256-bit DEK,
 *    generated once, wrapped under `KMS_MASTER_KEY`, and never decrypted to
 *    disk/logs — only unwrapped in memory for the duration of one encrypt/
 *    decrypt call.
 *  - Every `Credential.encryptedBlob` is encrypted under that tenant's DEK
 *    with a fresh random IV per write (never deterministic).
 */
@Injectable()
export class CredentialVaultService {
  private readonly logger = new Logger(CredentialVaultService.name);

  constructor(private readonly tenantDataKeys: TenantDataKeyRepository) {}

  /** Idempotent — returns the existing DEK if the tenant already has one,
   * otherwise generates and persists a brand-new one. */
  async getOrCreateTenantDek(tenantId: string): Promise<Buffer> {
    const existing = await this.tenantDataKeys.findByTenant(tenantId);
    if (existing !== null) {
      return unwrapDek(existing.wrappedDek, env.KMS_MASTER_KEY);
    }
    const dek = generateDek();
    const wrapped = wrapDek(dek, env.KMS_MASTER_KEY);
    await this.tenantDataKeys.create(tenantId, wrapped, CURRENT_KMS_KEY_ID);
    return dek;
  }

  async encryptForTenant(tenantId: string, plaintext: string): Promise<string> {
    const dek = await this.getOrCreateTenantDek(tenantId);
    return encryptSecret(plaintext, dek);
  }

  async decryptForTenant(tenantId: string, ciphertext: string): Promise<string> {
    const dek = await this.getOrCreateTenantDek(tenantId);
    return decryptSecret(ciphertext, dek);
  }

  maskedHint(plaintext: string): string {
    return maskSecret(plaintext);
  }

  /** Returns the id of the tenant's current `TenantDataKey` row (creating one
   * if it doesn't exist yet) — recorded on `Credential.dekTenantKeyId` purely
   * as a rotation audit trail, never used to pick which key decrypts a given
   * row (there is exactly one active DEK per tenant in this design). */
  async getActiveDekId(tenantId: string): Promise<string> {
    await this.getOrCreateTenantDek(tenantId);
    const row = await this.tenantDataKeys.findByTenant(tenantId);
    if (row === null) {
      throw new Error(`Invariant violated: TenantDataKey for ${tenantId} was just created but is now missing`);
    }
    return row.id;
  }

  /** Re-wraps a tenant's DEK under a new master key value — the practical
   * meaning of "key rotation" in an envelope scheme (featureslist.md 4.4):
   * every `Credential` row stays byte-for-byte unchanged, only the one
   * `TenantDataKey.wrappedDek` row is rewritten. Never call this with the
   * SAME key twice in a row expecting it to no-op — the old value must still
   * be the one that produced the current `wrappedDek`, or unwrapping fails
   * loudly (by design — a silent wrong-key failure would be worse). */
  async rotateMasterKeyWrap(tenantId: string, oldMasterKeyMaterial: string, newMasterKeyMaterial: string, newKmsKeyId: string): Promise<void> {
    const existing = await this.tenantDataKeys.findByTenant(tenantId);
    if (existing === null) {
      this.logger.warn(`rotateMasterKeyWrap: tenant ${tenantId} has no TenantDataKey yet — nothing to rotate`);
      return;
    }
    const rewrapped = rewrapDek(existing.wrappedDek, oldMasterKeyMaterial, newMasterKeyMaterial);
    await this.tenantDataKeys.rotate(tenantId, rewrapped, newKmsKeyId);
  }
}
