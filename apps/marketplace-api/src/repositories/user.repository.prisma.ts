import type { PrismaClient } from '../generated/prisma-client/index.js';
import { isRole } from '@marketplace/shared';
import type { CreateUserInput, UserRecord, UserRepository } from './user.repository.js';

/**
 * Real, Postgres-backed UserRepository. Implements the exact same
 * interface as MockUserRepository so AuthService never has to know which
 * one is active — it is only ever instantiated by the repository factory
 * when env.hasRealDatabase is true, which is not the case in this
 * sandbox (see docs/marketplace/DEBT.md — never exercised against a live
 * database here, only `prisma validate`/`prisma generate` were run for
 * real against this schema).
 */
export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByEmail(email: string): Promise<UserRecord | null> {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    return user ? toRecord(user) : null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    return user ? toRecord(user) : null;
  }

  async create(input: CreateUserInput): Promise<UserRecord> {
    const user = await this.prisma.user.create({
      data: {
        email: input.email.toLowerCase(),
        passwordHash: input.passwordHash,
        name: input.name,
        role: input.role,
        countryCode: input.countryCode,
      },
    });
    return toRecord(user);
  }
}

interface PrismaUserRow {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  role: string;
  countryCode: string | null;
  isActive: boolean;
  createdAt: Date;
}

function toRecord(user: PrismaUserRow): UserRecord {
  if (!isRole(user.role)) {
    throw new Error(`Unknown role "${user.role}" read from database`);
  }
  return {
    id: user.id,
    email: user.email,
    passwordHash: user.passwordHash,
    name: user.name,
    role: user.role,
    countryCode: user.countryCode,
    isActive: user.isActive,
    createdAt: user.createdAt,
  };
}
