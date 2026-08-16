import { Injectable } from '@nestjs/common';
import type { TaxNexus } from '@prisma/client';
import type { TaxSummaryView } from '@omnisell/shared';
import { OrderRepository } from '../repositories/order.repository';
import { TaxNexusRepository } from '../repositories/tax-nexus.repository';
import { TenantRepository } from '../repositories/tenant.repository';

const EU_OSS_COUNTRIES = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
]);

/**
 * Tax Centre (Phase 6, task 6.7): VAT/OSS summary, GCC VAT, US sales-tax
 * nexus summary, withholding notes — real calculation against real
 * `Order`/`TaxNexus` data, not a canned demo number.
 *
 * HONEST LIMITATION: jurisdiction is resolved from `Order.shippingAddress`
 * (a free-form `Json?` column — Phase 5 never standardised its shape across
 * connectors). `resolveJurisdiction` below reads the common `country`/
 * `state`/`region`/`province` keys a best-effort address object is likely to
 * have; an address whose shape doesn't match any of those keys is silently
 * excluded from every jurisdiction's totals rather than guessed at — a real
 * gap for connectors whose normalised order shape differs, tracked in
 * docs/DEBT.md.
 */
@Injectable()
export class TaxCentreService {
  constructor(
    private readonly orders: OrderRepository,
    private readonly nexuses: TaxNexusRepository,
    private readonly tenants: TenantRepository,
  ) {}

  async upsertNexus(tenantId: string, input: { jurisdictionType: string; jurisdictionCode: string; registeredAt?: Date | null; thresholdMinor?: bigint | null; ratePct: number; isActive: boolean }): Promise<TaxNexus> {
    return this.nexuses.upsert(tenantId, input);
  }

  async listNexuses(tenantId: string): Promise<TaxNexus[]> {
    return this.nexuses.listActive(tenantId);
  }

  async getSummary(tenantId: string, from: Date, to: Date): Promise<TaxSummaryView> {
    const tenant = await this.tenants.findById(tenantId);
    const currency = tenant?.currency ?? 'USD';
    const nexuses = await this.nexuses.listActive(tenantId);
    const orders = await this.orders.listAllForExport(tenantId, { placedFrom: from, placedTo: to }, 5000);

    let totalTaxCollectedMinor = 0n;
    for (const order of orders) {
      totalTaxCollectedMinor += order.taxMinor;
    }

    const byJurisdiction = nexuses.map((nexus) => {
      let taxableSalesMinor = 0n;
      let taxCollectedMinor = 0n;
      for (const order of orders) {
        if (jurisdictionMatches(nexus, order.shippingAddress)) {
          taxableSalesMinor += order.subtotalMinor;
          taxCollectedMinor += order.taxMinor;
        }
      }
      const overThreshold = nexus.thresholdMinor !== null && taxableSalesMinor >= nexus.thresholdMinor;
      return {
        jurisdictionType: nexus.jurisdictionType,
        jurisdictionCode: nexus.jurisdictionCode,
        taxableSalesMinor: taxableSalesMinor.toString(),
        taxCollectedMinor: taxCollectedMinor.toString(),
        ratePct: Number(nexus.ratePct),
        overThreshold,
      };
    });

    return { from: from.toISOString(), to: to.toISOString(), currency, totalTaxCollectedMinor: totalTaxCollectedMinor.toString(), byJurisdiction };
  }

  /**
   * General informational guidance, not tax advice (a disclaimer this method
   * always prepends) — real, tenant-independent reference text keyed by
   * jurisdiction type, covering the exact three regimes task 6.7 names.
   */
  getWithholdingNotes(): { disclaimer: string; notes: Array<{ jurisdictionType: string; note: string }> } {
    return {
      disclaimer: 'General informational guidance only — not tax advice. Consult a licensed tax professional in each jurisdiction before relying on these figures for filing.',
      notes: [
        { jurisdictionType: 'GCC_VAT', note: 'KSA standard VAT rate is 15%. ZATCA Phase-2 e-invoicing (UBL 2.1 XML + QR) is mandatory for VAT-registered taxpayers above the integration-phase threshold — see the Tax Centre\'s ZATCA panel.' },
        { jurisdictionType: 'US_STATE', note: 'Many US states shift sales-tax remittance to the marketplace/connector under "marketplace facilitator" laws once a channel meets its own nexus threshold — verify per state and per connector before assuming OmniSell (rather than the channel) owes remittance.' },
        { jurisdictionType: 'EU_OSS', note: 'The EU One-Stop-Shop scheme lets a single OSS VAT return cover cross-border B2C sales to all EU member states once the €10,000 pan-EU distance-selling threshold is exceeded, instead of registering in each member state separately.' },
      ],
    };
  }
}

function jurisdictionMatches(nexus: TaxNexus, shippingAddress: unknown): boolean {
  const address = extractAddressFields(shippingAddress);
  if (address === null) {
    return false;
  }
  switch (nexus.jurisdictionType) {
    case 'US_STATE':
      return address.country === 'US' && address.state === nexus.jurisdictionCode;
    case 'GCC_VAT':
      return address.country === nexus.jurisdictionCode;
    case 'EU_OSS':
      return address.country !== undefined && EU_OSS_COUNTRIES.has(address.country);
    default:
      return false;
  }
}

function extractAddressFields(value: unknown): { country?: string; state?: string } | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const country = firstString(record, ['country', 'countryCode', 'country_code']);
  const state = firstString(record, ['state', 'region', 'province', 'stateCode', 'state_code']);
  if (country === undefined && state === undefined) {
    return null;
  }
  return { ...(country !== undefined ? { country: country.toUpperCase() } : {}), ...(state !== undefined ? { state: state.toUpperCase() } : {}) };
}

function firstString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }
  return undefined;
}
