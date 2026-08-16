import { randomUUID } from 'node:crypto';
import type { CreateUserInput, UserRecord, UserRepository } from './user.repository.js';

/**
 * In-memory UserRepository — active whenever MOCK_MODE=true (the actual
 * state of this sandbox). Data does not survive a process restart, which
 * is expected and documented (docs/marketplace/DEBT.md) — it exists to
 * prove the auth service/routes work end-to-end without a live Postgres.
 */
export class MockUserRepository implements UserRepository {
  private readonly usersByEmail = new Map<string, UserRecord>();
  private readonly usersById = new Map<string, UserRecord>();

  async findByEmail(email: string): Promise<UserRecord | null> {
    return this.usersByEmail.get(email.toLowerCase()) ?? null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    return this.usersById.get(id) ?? null;
  }

  async create(input: CreateUserInput): Promise<UserRecord> {
    const existing = this.usersByEmail.get(input.email.toLowerCase());
    if (existing) {
      throw new Error(`User with email ${input.email} already exists`);
    }
    const record: UserRecord = {
      id: randomUUID(),
      email: input.email.toLowerCase(),
      passwordHash: input.passwordHash,
      name: input.name,
      role: input.role,
      countryCode: input.countryCode,
      isActive: true,
      createdAt: new Date(),
    };
    this.usersByEmail.set(record.email, record);
    this.usersById.set(record.id, record);
    return record;
  }
}
