import { describe, expect, it, vi } from 'vitest';
import { TaxCentreService } from '../src/finance/tax-centre.service';
import type { OrderRepository } from '../src/repositories/order.repository';
import type { TaxNexusRepository } from '../src/repositories/tax-nexus.repository';
import type { TenantRepository } from '../src/repositories/tenant.repository';

const orders = [
  { id: 'o1', subtotalMinor: 1000n, taxMinor: 150n, shippingAddress: { country: 'sa' } }, // GCC VAT (KSA)
  { id: 'o2', subtotalMinor: 2000n, taxMinor: 175n, shippingAddress: { country: 'us', state: 'ca' } }, // US state
  { id: 'o3', subtotalMinor: 500n, taxMinor: 100n, shippingAddress: { country: 'de' } }, // EU OSS
  { id: 'o4', subtotalMinor: 300n, taxMinor: 0n, shippingAddress: null }, // unresolvable — excluded
];

function makeService() {
  const orderRepo = { listAllForExport: vi.fn().mockResolvedValue(orders) };
  const nexuses = {
    listActive: vi.fn().mockResolvedValue([
      { jurisdictionType: 'GCC_VAT', jurisdictionCode: 'SA', thresholdMinor: null, ratePct: 15 },
      { jurisdictionType: 'US_STATE', jurisdictionCode: 'CA', thresholdMinor: 500_000n, ratePct: 7.25 },
      { jurisdictionType: 'EU_OSS', jurisdictionCode: 'EU', thresholdMinor: null, ratePct: 0 },
    ]),
  };
  const tenants = { findById: vi.fn().mockResolvedValue({ currency: 'USD' }) };
  const service = new TaxCentreService(orderRepo as unknown as OrderRepository, nexuses as unknown as TaxNexusRepository, tenants as unknown as TenantRepository);
  return { service };
}

describe('TaxCentreService.getSummary', () => {
  it('attributes taxable sales/tax collected to the correct jurisdiction from shippingAddress', async () => {
    const { service } = makeService();
    const summary = await service.getSummary('t1', new Date('2026-08-01'), new Date('2026-08-31'));

    expect(summary.totalTaxCollectedMinor).toBe('425'); // 150+175+100+0

    const gcc = summary.byJurisdiction.find((j) => j.jurisdictionCode === 'SA');
    expect(gcc?.taxableSalesMinor).toBe('1000');
    expect(gcc?.taxCollectedMinor).toBe('150');

    const us = summary.byJurisdiction.find((j) => j.jurisdictionCode === 'CA');
    expect(us?.taxableSalesMinor).toBe('2000');
    expect(us?.overThreshold).toBe(false); // 2000 < 500000 threshold

    const eu = summary.byJurisdiction.find((j) => j.jurisdictionCode === 'EU');
    expect(eu?.taxableSalesMinor).toBe('500');
  });
});

describe('TaxCentreService.getWithholdingNotes', () => {
  it('returns a disclaimer plus one note per named jurisdiction type', () => {
    const { service } = makeService();
    const notes = service.getWithholdingNotes();
    expect(notes.disclaimer).toMatch(/not tax advice/i);
    expect(notes.notes.map((n) => n.jurisdictionType)).toEqual(['GCC_VAT', 'US_STATE', 'EU_OSS']);
  });
});
