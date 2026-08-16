import { describe, expect, it, vi } from 'vitest';
import { FinanceDisputeService } from '../src/finance/finance-dispute.service';
import type { FinanceDisputeRepository } from '../src/repositories/finance-dispute.repository';

function makeService() {
  const disputes = {
    create: vi.fn().mockImplementation((data) => Promise.resolve({ id: 'd1', status: 'OPEN', ...data })),
    findById: vi.fn().mockResolvedValue({ id: 'd1', status: 'OPEN' }),
    list: vi.fn().mockResolvedValue([]),
    resolve: vi.fn().mockImplementation((_t, _id, status) => Promise.resolve({ id: 'd1', status })),
  };
  return { service: new FinanceDisputeService(disputes as unknown as FinanceDisputeRepository), disputes };
}

describe('FinanceDisputeService', () => {
  it('creates a dispute with a mandatory reason code', async () => {
    const { service, disputes } = makeService();
    await service.create('t1', 'user-1', { sourceType: 'order', sourceId: 'o1', amountMinor: 100n, currency: 'USD', reasonCode: 'CHARGEBACK' });
    expect(disputes.create).toHaveBeenCalledWith(expect.objectContaining({ reasonCode: 'CHARGEBACK', raisedById: 'user-1' }));
  });

  it('resolves an open dispute', async () => {
    const { service } = makeService();
    const result = await service.resolve('t1', 'd1', 'RESOLVED', 'admin-1');
    expect(result.status).toBe('RESOLVED');
  });

  it('refuses to resolve an already-resolved dispute', async () => {
    const { service, disputes } = makeService();
    disputes.findById.mockResolvedValue({ id: 'd1', status: 'RESOLVED' });
    await expect(service.resolve('t1', 'd1', 'RESOLVED', 'admin-1')).rejects.toThrow(/already/);
  });

  it('throws for a missing dispute', async () => {
    const { service, disputes } = makeService();
    disputes.findById.mockResolvedValue(null);
    await expect(service.resolve('t1', 'missing', 'RESOLVED', 'admin-1')).rejects.toThrow(/not found/i);
  });
});
