import type { Role } from '@marketplace/shared';

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  role: Role;
  countryCode: string | null;
  isActive: boolean;
  createdAt: Date;
}

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  name: string;
  role: Role;
  countryCode: string | null;
}

/**
 * Repository interface auth (and later supplier/affiliate/admin) flows
 * depend on. `MockUserRepository` (in-memory) backs MOCK_MODE; a
 * `PrismaUserRepository` implementing this exact interface is the real,
 * Postgres-backed path once MARKETPLACE_DATABASE_URL is configured.
 */
export interface UserRepository {
  findByEmail(email: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
  create(input: CreateUserInput): Promise<UserRecord>;
}
