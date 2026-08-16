import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  ApplyPricingRuleInput,
  ApplyPricingRuleResult,
  CreatePricingRuleInput,
  MarginPreviewInput,
  MarginPreviewResult,
  PricingRuleSummary,
  UpdatePricingRuleInput,
} from '@omnisell/shared';
import { PricingRuleRepository } from '../../repositories/pricing-rule.repository';
import { AuditLogService } from '../../audit/audit-log.service';
import { computePrice, type PricingRuleConfig } from './pricing.engine';
import { computeMargin, toWaterfallSteps } from '../margin/margin.engine';

const WATERFALL_LABEL_KEYS: Record<string, string> = {
  gross: 'catalog.margin.waterfall.gross',
  fees: 'catalog.margin.waterfall.fees',
  print: 'catalog.margin.waterfall.print',
  shipping: 'catalog.margin.waterfall.shipping',
  tax: 'catalog.margin.waterfall.tax',
  net: 'catalog.margin.waterfall.net',
};

/**
 * Pricing rules (featureslist.md 3.6) + margin preview/waterfall (3.7,
 * "signature moment #1"). Thin persistence/formatting wrapper around the
 * pure engines in ./pricing.engine.ts and ../margin/margin.engine.ts.
 */
@Injectable()
export class PricingService {
  constructor(
    private readonly rules: PricingRuleRepository,
    private readonly audit: AuditLogService,
  ) {}

  async create(tenantId: string, userId: string, input: CreatePricingRuleInput): Promise<PricingRuleSummary> {
    const rule = await this.rules.create({
      tenantId,
      name: input.name,
      method: input.method,
      costPlusPct: input.costPlusPct ?? null,
      fixedMarginPct: input.fixedMarginPct ?? null,
      targetPriceMinor: input.targetPriceMinor !== undefined ? BigInt(input.targetPriceMinor) : null,
      roundingMode: input.roundingMode,
      isActive: input.isActive,
      ...(input.channelMultipliers !== undefined ? { channelMultipliers: input.channelMultipliers } : {}),
      ...(input.currencyFloors !== undefined ? { currencyFloors: input.currencyFloors } : {}),
    });
    await this.audit.record({ tenantId, actorId: userId, action: 'pricing_rule.created', entityType: 'PricingRule', entityId: rule.id, after: rule });
    return toSummary(rule);
  }

  async update(tenantId: string, userId: string, id: string, input: UpdatePricingRuleInput): Promise<PricingRuleSummary> {
    const before = await this.rules.findById(tenantId, id);
    if (before === null) {
      throw new NotFoundException('Pricing rule not found');
    }
    const rule = await this.rules.update(tenantId, id, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.costPlusPct !== undefined ? { costPlusPct: input.costPlusPct } : {}),
      ...(input.fixedMarginPct !== undefined ? { fixedMarginPct: input.fixedMarginPct } : {}),
      ...(input.targetPriceMinor !== undefined ? { targetPriceMinor: BigInt(input.targetPriceMinor) } : {}),
      ...(input.roundingMode !== undefined ? { roundingMode: input.roundingMode } : {}),
      ...(input.channelMultipliers !== undefined ? { channelMultipliers: input.channelMultipliers } : {}),
      ...(input.currencyFloors !== undefined ? { currencyFloors: input.currencyFloors } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    });
    if (rule === null) {
      throw new NotFoundException('Pricing rule not found');
    }
    await this.audit.record({ tenantId, actorId: userId, action: 'pricing_rule.updated', entityType: 'PricingRule', entityId: id, before, after: rule });
    return toSummary(rule);
  }

  async list(tenantId: string): Promise<PricingRuleSummary[]> {
    const rows = await this.rules.list(tenantId);
    return rows.map(toSummary);
  }

  async applyRule(tenantId: string, input: ApplyPricingRuleInput): Promise<ApplyPricingRuleResult> {
    const rule = await this.rules.findById(tenantId, input.pricingRuleId);
    if (rule === null) {
      throw new NotFoundException('Pricing rule not found');
    }
    const config = toEngineConfig(rule);
    const priceMinor = computePrice(config, BigInt(input.baseCostMinor), { currency: input.currency, channel: input.channel });
    const marginPct = priceMinor === 0n ? 0 : Number((priceMinor - BigInt(input.baseCostMinor)) * 10000n / priceMinor) / 100;
    return { priceMinor: priceMinor.toString(), currency: input.currency, marginPct };
  }

  /** Margin preview + waterfall (3.7, signature moment #1). Pure computation
   * — no persistence, called live as the user edits the product builder. */
  preview(input: MarginPreviewInput): MarginPreviewResult {
    const result = computeMargin({
      baseCostMinor: BigInt(input.baseCostMinor),
      priceMinor: BigInt(input.priceMinor),
      channelFeePct: input.channelFeePct,
      channelFeeFixedMinor: BigInt(input.channelFeeFixedMinor),
      shippingMinor: BigInt(input.shippingMinor),
      taxPct: input.taxPct,
    });
    const waterfall = toWaterfallSteps(result).map((step) => ({
      key: step.key,
      labelKey: WATERFALL_LABEL_KEYS[step.key] ?? step.key,
      amountMinor: step.amountMinor.toString(),
    }));
    return {
      currency: input.currency,
      grossMinor: result.grossMinor.toString(),
      feesMinor: result.feesMinor.toString(),
      printCostMinor: result.printCostMinor.toString(),
      shippingMinor: result.shippingMinor.toString(),
      taxMinor: result.taxMinor.toString(),
      netMinor: result.netMinor.toString(),
      marginPct: result.marginPct,
      waterfall,
    };
  }
}

function toEngineConfig(rule: {
  method: string;
  costPlusPct: number | null;
  fixedMarginPct: number | null;
  targetPriceMinor: bigint | null;
  roundingMode: string;
  channelMultipliers: unknown;
  currencyFloors: unknown;
}): PricingRuleConfig {
  const currencyFloors = rule.currencyFloors as Record<string, string> | null;
  return {
    method: rule.method as PricingRuleConfig['method'],
    costPlusPct: rule.costPlusPct ?? undefined,
    fixedMarginPct: rule.fixedMarginPct ?? undefined,
    targetPriceMinor: rule.targetPriceMinor ?? undefined,
    roundingMode: rule.roundingMode as PricingRuleConfig['roundingMode'],
    channelMultipliers: (rule.channelMultipliers as Record<string, number> | null) ?? undefined,
    currencyFloors: currencyFloors !== null ? Object.fromEntries(Object.entries(currencyFloors).map(([k, v]) => [k, BigInt(v)])) : undefined,
  };
}

function toSummary(rule: {
  id: string;
  name: string;
  method: string;
  costPlusPct: number | null;
  fixedMarginPct: number | null;
  targetPriceMinor: bigint | null;
  roundingMode: string;
  channelMultipliers: unknown;
  currencyFloors: unknown;
  isActive: boolean;
}): PricingRuleSummary {
  return {
    id: rule.id,
    name: rule.name,
    method: rule.method,
    costPlusPct: rule.costPlusPct,
    fixedMarginPct: rule.fixedMarginPct,
    targetPriceMinor: rule.targetPriceMinor?.toString() ?? null,
    roundingMode: rule.roundingMode,
    channelMultipliers: rule.channelMultipliers as Record<string, number> | null,
    currencyFloors: rule.currencyFloors as Record<string, string> | null,
    isActive: rule.isActive,
  };
}
