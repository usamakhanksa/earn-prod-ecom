import { Module } from '@nestjs/common';
import { CredentialVaultService } from './credential-vault.service';
import { TenantDataKeyRepository } from '../repositories/tenant-data-key.repository';

@Module({
  providers: [CredentialVaultService, TenantDataKeyRepository],
  exports: [CredentialVaultService],
})
export class VaultModule {}
