import { Injectable } from '@nestjs/common';
import type { BannedTerm, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * `BannedTerm` is GLOBAL (admin-editable IP/trademark dictionary, prompt.md
 * data model) — same non-tenant-scoped pattern as `ConnectorDefinition`
 * (see that repository's doc comment). Every tenant's publish attempt is
 * linted against the exact same dictionary.
 */
@Injectable()
export class BannedTermRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listActive(): Promise<BannedTerm[]> {
    return this.prisma.bannedTerm.findMany({ where: { isActive: true }, orderBy: { term: 'asc' } });
  }

  async listAll(): Promise<BannedTerm[]> {
    return this.prisma.bannedTerm.findMany({ orderBy: { term: 'asc' } });
  }

  async findById(id: string): Promise<BannedTerm | null> {
    return this.prisma.bannedTerm.findUnique({ where: { id } });
  }

  async create(data: Prisma.BannedTermUncheckedCreateInput): Promise<BannedTerm> {
    return this.prisma.bannedTerm.create({ data });
  }

  async update(id: string, data: Prisma.BannedTermUpdateInput): Promise<BannedTerm> {
    return this.prisma.bannedTerm.update({ where: { id }, data });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.bannedTerm.delete({ where: { id } });
  }
}
