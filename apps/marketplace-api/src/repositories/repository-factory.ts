import { MockCountryConfigRepository, type CountryConfigRepository } from '@marketplace/country';
import { env } from '../env.js';
import { getPrismaClient } from '../lib/prisma.js';
import type { UserRepository } from './user.repository.js';
import { MockUserRepository } from './user.repository.mock.js';
import { PrismaUserRepository } from './user.repository.prisma.js';
import { PrismaCountryConfigRepository } from './country-config.repository.prisma.js';
import type { ProductRepository } from './product.repository.js';
import { MockProductRepository } from './product.repository.mock.js';
import { PrismaProductRepository } from './product.repository.prisma.js';

/**
 * Single place that decides mock vs. real repositories, driven entirely by
 * env.hasRealDatabase (itself derived from MOCK_MODE + whether
 * MARKETPLACE_DATABASE_URL is set). Every consumer (routes/services) only
 * ever sees the interface — this is the one file allowed to know which
 * concrete implementation is active.
 *
 * Both factories memoize a singleton: the mock repositories hold in-memory
 * state (e.g. registered users) that must survive across requests within
 * the same process, and the Prisma-backed ones should reuse one client.
 */
let userRepositorySingleton: UserRepository | null = null;
let countryConfigRepositorySingleton: CountryConfigRepository | null = null;
let productRepositorySingleton: ProductRepository | null = null;

export function createUserRepository(): UserRepository {
  if (!userRepositorySingleton) {
    userRepositorySingleton = env.hasRealDatabase
      ? new PrismaUserRepository(getPrismaClient())
      : new MockUserRepository();
  }
  return userRepositorySingleton;
}

export function createCountryConfigRepository(): CountryConfigRepository {
  if (!countryConfigRepositorySingleton) {
    countryConfigRepositorySingleton = env.hasRealDatabase
      ? new PrismaCountryConfigRepository(getPrismaClient())
      : new MockCountryConfigRepository();
  }
  return countryConfigRepositorySingleton;
}

export function createProductRepository(): ProductRepository {
  if (!productRepositorySingleton) {
    productRepositorySingleton = env.hasRealDatabase
      ? new PrismaProductRepository(getPrismaClient())
      : new MockProductRepository();
  }
  return productRepositorySingleton;
}
