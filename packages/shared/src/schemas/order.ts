import { z } from 'zod';
import {
  ORDER_EXCEPTION_STATUSES,
  ORDER_EXCEPTION_TYPES,
  ORDER_STATUSES,
  ROUTING_STRATEGIES,
  BUYER_MESSAGE_TYPES,
} from '../enums';
import { currencyCodeSchema } from '../money';

/**
 * Orders, Fulfilment & Digital Delivery (Phase 5 / featureslist.md §6,
 * implentationplanphase.md tasks 5.1-5.9). Same shared-schema-drives-both-
 * validation-and-forms pattern as Phase 4's `listing.ts`.
 */

const minorStringSchema = z.string().regex(/^-?\d+$/, 'Minor-unit integer required');

// --- Feed / filters (5.3/6.14) ---

export const listOrdersQuerySchema = z.object({
  status: z.array(z.enum(ORDER_STATUSES)).optional(),
  connectorSlug: z.string().optional(),
  connectionId: z.string().optional(),
  search: z.string().max(200).optional(),
  placedFrom: z.string().datetime().optional(),
  placedTo: z.string().datetime().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;

export const saveOrderViewSchema = z.object({
  name: z.string().min(1).max(120),
  filters: z.record(z.string(), z.unknown()),
});
export type SaveOrderViewInput = z.infer<typeof saveOrderViewSchema>;

// --- Manual/digital-only order creation (no connector involved) ---

export const createManualOrderItemSchema = z.object({
  title: z.string().min(1).max(500),
  sku: z.string().max(120).optional(),
  quantity: z.number().int().min(1).max(10_000),
  unitPriceMinor: minorStringSchema,
  isDigital: z.boolean().default(false),
  digitalProductId: z.string().optional(),
  productVariantId: z.string().optional(),
});
export type CreateManualOrderItemInput = z.infer<typeof createManualOrderItemSchema>;

export const createManualOrderSchema = z.object({
  buyerName: z.string().max(300).optional(),
  buyerEmail: z.string().email().optional(),
  currency: currencyCodeSchema,
  items: z.array(createManualOrderItemSchema).min(1).max(200),
  shippingMinor: minorStringSchema.default('0'),
  taxMinor: minorStringSchema.default('0'),
  shippingAddress: z.record(z.string(), z.string()).optional(),
  billingAddress: z.record(z.string(), z.string()).optional(),
});
export type CreateManualOrderInput = z.infer<typeof createManualOrderSchema>;

// --- Status-machine actions (5.2/6.3) ---

export const holdOrderSchema = z.object({ reason: z.string().min(1).max(500) });
export type HoldOrderInput = z.infer<typeof holdOrderSchema>;

export const cancelOrderSchema = z.object({ reason: z.string().min(1).max(500) });
export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;

// --- Fulfilment (5.4) ---

export const fulfilOrderSchema = z.object({
  orderItemId: z.string().optional(), // omit = whole-order fulfilment
  connectionId: z.string().optional(), // omit = let the routing engine choose
});
export type FulfilOrderInput = z.infer<typeof fulfilOrderSchema>;

export const routingRuleConditionsSchema = z.object({
  regions: z.array(z.string().min(1).max(10)).optional(),
  connectorSlugs: z.array(z.string().min(1)).optional(),
  productIds: z.array(z.string().min(1)).optional(),
});
export type RoutingRuleConditions = z.infer<typeof routingRuleConditionsSchema>;

export const createRoutingRuleSchema = z.object({
  name: z.string().min(1).max(200),
  strategy: z.enum(ROUTING_STRATEGIES),
  priority: z.number().int().min(0).max(10_000).default(0),
  conditions: routingRuleConditionsSchema.optional(),
  isActive: z.boolean().default(true),
});
export type CreateRoutingRuleInput = z.infer<typeof createRoutingRuleSchema>;

export const updateRoutingRuleSchema = createRoutingRuleSchema.partial();
export type UpdateRoutingRuleInput = z.infer<typeof updateRoutingRuleSchema>;

// --- Shipment / tracking (5.5) ---

export const recordTrackingEventSchema = z.object({
  status: z.string().min(1).max(60),
  description: z.string().max(500).optional(),
  location: z.string().max(200).optional(),
  occurredAt: z.string().datetime(),
});
export type RecordTrackingEventInput = z.infer<typeof recordTrackingEventSchema>;

export const updateShipmentSchema = z.object({
  carrier: z.string().max(100).optional(),
  trackingNumber: z.string().max(200).optional(),
  status: z.string().min(1).max(60).optional(),
  estimatedDeliveryAt: z.string().datetime().optional(),
});
export type UpdateShipmentInput = z.infer<typeof updateShipmentSchema>;

// --- Exception queue (5.6/6.7/6.11) ---

export const listExceptionsQuerySchema = z.object({
  status: z.array(z.enum(ORDER_EXCEPTION_STATUSES)).optional(),
  type: z.enum(ORDER_EXCEPTION_TYPES).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListExceptionsQuery = z.infer<typeof listExceptionsQuerySchema>;

export const resolveExceptionSchema = z.object({
  resolutionNote: z.string().min(1).max(2000),
});
export type ResolveExceptionInput = z.infer<typeof resolveExceptionSchema>;

export const acknowledgeExceptionSchema = z.object({}).optional();

// --- Returns / refunds / reprints (5.7/6.8) ---

export const requestReturnSchema = z.object({
  reason: z.string().min(1).max(1000),
  orderItemIds: z.array(z.string().min(1)).min(1).max(200),
});
export type RequestReturnInput = z.infer<typeof requestReturnSchema>;

export const decideReturnSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  note: z.string().max(1000).optional(),
});
export type DecideReturnInput = z.infer<typeof decideReturnSchema>;

export const issueRefundSchema = z.object({
  amountMinor: minorStringSchema,
  reason: z.string().min(1).max(1000),
  returnId: z.string().optional(),
  costAttribution: z
    .object({
      printCostMinor: minorStringSchema.optional(),
      shippingMinor: minorStringSchema.optional(),
      feeMinor: minorStringSchema.optional(),
    })
    .optional(),
});
export type IssueRefundInput = z.infer<typeof issueRefundSchema>;

export const requestReprintSchema = z.object({
  orderItemId: z.string().optional(),
  reason: z.string().min(1).max(1000),
  costMinor: minorStringSchema.default('0'),
});
export type RequestReprintInput = z.infer<typeof requestReprintSchema>;

// --- Buyer messages (5.9/6.10) ---

export const sendBuyerMessageSchema = z.object({
  templateType: z.enum(BUYER_MESSAGE_TYPES),
  locale: z.enum(['en', 'ar']).default('en'),
});
export type SendBuyerMessageInput = z.infer<typeof sendBuyerMessageSchema>;

export const upsertBuyerMessageTemplateSchema = z.object({
  type: z.enum(BUYER_MESSAGE_TYPES),
  locale: z.enum(['en', 'ar']),
  subject: z.string().min(1).max(300),
  body: z.string().min(1).max(10_000),
});
export type UpsertBuyerMessageTemplateInput = z.infer<typeof upsertBuyerMessageTemplateSchema>;

// --- Response / view shapes ---

export interface OrderItemView {
  id: string;
  title: string;
  sku: string | null;
  quantity: number;
  unitPriceMinor: string;
  totalPriceMinor: string;
  currency: string;
  isDigital: boolean;
  digitalProductId: string | null;
  productVariantId: string | null;
}

export interface OrderFeeView {
  id: string;
  type: string;
  amountMinor: string;
  currency: string;
  note: string | null;
}

export interface OrderExceptionView {
  id: string;
  orderId: string;
  type: string;
  status: string;
  message: string;
  slaDueAt: string | null;
  breachedAt: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
  createdAt: string;
}

export interface OrderEventView {
  id: string;
  type: string;
  message: string;
  payload: unknown;
  actorId: string | null;
  createdAt: string;
}

export interface TrackingEventView {
  id: string;
  status: string;
  description: string | null;
  location: string | null;
  occurredAt: string;
}

export interface ShipmentView {
  id: string;
  carrier: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  status: string;
  shippedAt: string | null;
  estimatedDeliveryAt: string | null;
  deliveredAt: string | null;
  trackingEvents: TrackingEventView[];
}

export interface FulfilmentView {
  id: string;
  orderItemId: string | null;
  connectionId: string | null;
  connectorSlug: string | null;
  externalFulfilmentId: string | null;
  status: string;
  routingStrategy: string | null;
  lastError: string | null;
  shipments: ShipmentView[];
  createdAt: string;
}

export interface OrderSummary {
  id: string;
  orderNumber: string;
  connectorSlug: string;
  externalOrderId: string | null;
  status: string;
  buyerName: string | null;
  buyerEmail: string | null;
  currency: string;
  totalMinor: string;
  placedAt: string;
  openExceptionCount: number;
  createdAt: string;
}

export interface OrderDetail extends OrderSummary {
  subtotalMinor: string;
  discountMinor: string;
  taxMinor: string;
  shippingMinor: string;
  shippingAddress: unknown;
  billingAddress: unknown;
  holdReason: string | null;
  cancelReason: string | null;
  items: OrderItemView[];
  fees: OrderFeeView[];
  exceptions: OrderExceptionView[];
  fulfilments: FulfilmentView[];
  events: OrderEventView[];
}

export interface RoutingRuleView {
  id: string;
  name: string;
  strategy: string;
  priority: number;
  conditions: unknown;
  isActive: boolean;
}

export interface ReturnView {
  id: string;
  orderId: string;
  status: string;
  reason: string | null;
  createdAt: string;
}

export interface RefundView {
  id: string;
  orderId: string;
  amountMinor: string;
  currency: string;
  status: string;
  reason: string | null;
  createdAt: string;
}

export interface ReprintView {
  id: string;
  orderId: string;
  status: string;
  costMinor: string;
  currency: string;
  createdAt: string;
}
