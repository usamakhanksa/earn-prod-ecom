import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateDigitalFileInput,
  CreateDigitalProductInput,
  CreateFileVersionInput,
  DigitalProductView,
  UpdateDigitalProductInput,
} from '@omnisell/shared';
import { DigitalProductRepository, type DigitalProductWithFiles } from '../repositories/digital-product.repository';

/** DigitalProduct + file/version tree (featureslist.md 7.1, task 5.10). File
 * bytes themselves flow through Phase 2's presigned/resumable upload
 * pipeline unmodified — this service only registers the resulting storage
 * key as a new, append-only `DigitalFileVersion` row. */
@Injectable()
export class DigitalProductService {
  constructor(private readonly repo: DigitalProductRepository) {}

  async create(tenantId: string, input: CreateDigitalProductInput): Promise<DigitalProductView> {
    const row = await this.repo.create({ tenantId, name: input.name, description: input.description ?? null, productId: input.productId ?? null });
    return toView({ ...row, files: [] });
  }

  async list(tenantId: string): Promise<DigitalProductView[]> {
    const rows = await this.repo.list(tenantId);
    return rows.map(toView);
  }

  async getDetail(tenantId: string, id: string): Promise<DigitalProductView> {
    const row = await this.repo.findById(tenantId, id);
    if (row === null) {
      throw new NotFoundException({ message: 'Digital product not found', code: 'DIGITAL_PRODUCT_NOT_FOUND' });
    }
    return toView(row);
  }

  async update(tenantId: string, id: string, input: UpdateDigitalProductInput): Promise<DigitalProductView> {
    const row = await this.repo.update(tenantId, id, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    });
    if (row === null) {
      throw new NotFoundException({ message: 'Digital product not found', code: 'DIGITAL_PRODUCT_NOT_FOUND' });
    }
    return this.getDetail(tenantId, id);
  }

  async addFile(tenantId: string, digitalProductId: string, input: CreateDigitalFileInput) {
    const product = await this.repo.findById(tenantId, digitalProductId);
    if (product === null) {
      throw new NotFoundException({ message: 'Digital product not found', code: 'DIGITAL_PRODUCT_NOT_FOUND' });
    }
    return this.repo.createFile({ tenantId, digitalProductId, name: input.name });
  }

  async addFileVersion(tenantId: string, digitalFileId: string, input: CreateFileVersionInput) {
    const file = await this.repo.findFileById(tenantId, digitalFileId);
    if (file === null) {
      throw new NotFoundException({ message: 'Digital file not found', code: 'DIGITAL_FILE_NOT_FOUND' });
    }
    return this.repo.createVersion(tenantId, digitalFileId, {
      version: input.version,
      storageKey: input.storageKey,
      sizeBytes: input.sizeBytes !== undefined ? BigInt(input.sizeBytes) : null,
      checksum: input.checksum ?? null,
    });
  }
}

function toView(row: DigitalProductWithFiles): DigitalProductView {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    productId: row.productId,
    isActive: row.isActive,
    files: row.files.map((f) => ({
      id: f.id,
      name: f.name,
      versions: f.versions.map((v) => ({
        id: v.id,
        version: v.version,
        sizeBytes: v.sizeBytes?.toString() ?? null,
        checksum: v.checksum,
        isCurrent: v.isCurrent,
        createdAt: v.createdAt.toISOString(),
      })),
    })),
    createdAt: row.createdAt.toISOString(),
  };
}
