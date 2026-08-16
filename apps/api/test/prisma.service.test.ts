import { describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service';

describe('PrismaService boot behaviour', () => {
  it('constructs without connecting to a database', () => {
    const service = new PrismaService();
    expect(service).toBeInstanceOf(PrismaService);
    void service.$disconnect();
  });
});