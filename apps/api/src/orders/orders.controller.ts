import { Body, Controller, Get, Header, Headers, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import {
  acknowledgeExceptionSchema,
  cancelOrderSchema,
  createManualOrderSchema,
  createRoutingRuleSchema,
  decideReturnSchema,
  fulfilOrderSchema,
  holdOrderSchema,
  issueRefundSchema,
  listExceptionsQuerySchema,
  listOrdersQuerySchema,
  recordTrackingEventSchema,
  requestReprintSchema,
  requestReturnSchema,
  resolveExceptionSchema,
  saveOrderViewSchema,
  sendBuyerMessageSchema,
  updateRoutingRuleSchema,
  updateShipmentSchema,
  upsertBuyerMessageTemplateSchema,
} from '@omnisell/shared';
import { OrdersService } from './orders.service';
import { FulfilmentService } from './fulfilment.service';
import { ShipmentService } from './shipment.service';
import { OrderExceptionService } from './order-exception.service';
import { ReturnsRefundsService } from './returns-refunds.service';
import { BuyerMessageService } from './buyer-message.service';
import { PackingSlipService } from './packing-slip.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContextGuard } from '../auth/tenant-context.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import type { TenantContext } from '../auth/tenant-context.guard';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { PoliciesGuard } from '../rbac/policies.guard';
import { CheckPolicies } from '../rbac/check-policies.decorator';

/**
 * Orders, Fulfilment & Digital Delivery — the unified order feed, status
 * machine, fulfilment/routing, shipment/tracking, exception queue,
 * returns/refunds/reprints, buyer messages, and packing-slip/invoice
 * generation (featureslist.md §6, implentationplanphase.md tasks 5.2-5.9).
 * Route surface follows prompt.md's literal API list
 * (`GET /orders`, `GET /orders/:id`, `POST /orders/:id/fulfil`,
 * `POST /orders/:id/hold|release|cancel`, `POST /orders/:id/refund`,
 * `POST /orders/:id/reprint`, `GET /orders/exceptions`) plus real
 * extensions this phase's other tasks require (saved views, CSV export,
 * routing rules, shipment tracking, buyer messages, packing slip/invoice).
 */
@Controller('orders')
@UseGuards(JwtAuthGuard, TenantContextGuard)
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly fulfilments: FulfilmentService,
    private readonly shipments: ShipmentService,
    private readonly exceptions: OrderExceptionService,
    private readonly returnsRefunds: ReturnsRefundsService,
    private readonly buyerMessages: BuyerMessageService,
    private readonly packingSlip: PackingSlipService,
    private readonly idempotency: IdempotencyService,
  ) {}

  // --- Feed (6.1/6.14) ---

  @Get()
  async list(@CurrentTenant() tenant: TenantContext, @Query() query: unknown) {
    return this.orders.list(tenant.tenantId, listOrdersQuerySchema.parse(query));
  }

  @Get('export')
  @Header('Content-Type', 'text/csv')
  async exportCsv(@CurrentTenant() tenant: TenantContext, @Query() query: unknown, @Res() res: Response): Promise<void> {
    const csv = await this.orders.exportCsv(tenant.tenantId, listOrdersQuerySchema.parse(query));
    res.setHeader('Content-Disposition', 'attachment; filename="orders.csv"');
    res.send(csv);
  }

  @Get('exceptions')
  async listExceptions(@CurrentTenant() tenant: TenantContext, @Query() query: unknown) {
    return this.exceptions.list(tenant.tenantId, listExceptionsQuerySchema.parse(query));
  }

  @Post('exceptions/:id/acknowledge')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('update', 'OrderException'))
  async acknowledgeException(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() body: unknown) {
    acknowledgeExceptionSchema.parse(body ?? {});
    return this.exceptions.acknowledge(tenant.tenantId, id, tenant.userId);
  }

  @Post('exceptions/:id/resolve')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('update', 'OrderException'))
  async resolveException(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() body: unknown) {
    const input = resolveExceptionSchema.parse(body);
    return this.exceptions.resolve(tenant.tenantId, id, input.resolutionNote, tenant.userId);
  }

  // --- Saved views (5.3) ---

  @Get('saved-views')
  async listSavedViews(@CurrentTenant() tenant: TenantContext) {
    return this.orders.listSavedViews(tenant.tenantId, tenant.userId);
  }

  @Post('saved-views')
  async saveView(@CurrentTenant() tenant: TenantContext, @Body() body: unknown) {
    return this.orders.saveView(tenant.tenantId, tenant.userId, saveOrderViewSchema.parse(body));
  }

  // --- Routing rules (6.4) ---

  @Get('routing-rules')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('read', 'FulfilmentRoutingRule'))
  async listRoutingRules(@CurrentTenant() tenant: TenantContext) {
    return this.fulfilments.listRoutingRules(tenant.tenantId);
  }

  @Post('routing-rules')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('create', 'FulfilmentRoutingRule'))
  async createRoutingRule(@CurrentTenant() tenant: TenantContext, @Body() body: unknown) {
    return this.fulfilments.createRoutingRule(tenant.tenantId, createRoutingRuleSchema.parse(body));
  }

  @Post('routing-rules/:id')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('update', 'FulfilmentRoutingRule'))
  async updateRoutingRule(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() body: unknown) {
    return this.fulfilments.updateRoutingRule(tenant.tenantId, id, updateRoutingRuleSchema.parse(body));
  }

  // --- Buyer message templates (6.10) — MUST be registered before the
  // single-segment `GET/POST :id` handlers below, or Nest/Express would try
  // to match "message-templates" as an order id first. ---

  @Get('message-templates')
  async listTemplates(@CurrentTenant() tenant: TenantContext) {
    return this.buyerMessages.listTemplates(tenant.tenantId);
  }

  @Post('message-templates')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('update', 'BuyerMessageTemplate'))
  async upsertTemplate(@CurrentTenant() tenant: TenantContext, @Body() body: unknown) {
    return this.buyerMessages.upsertTemplate(tenant.tenantId, upsertBuyerMessageTemplateSchema.parse(body));
  }

  // --- Detail + status machine ---

  @Get(':id')
  async getOne(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.orders.getDetail(tenant.tenantId, id);
  }

  @Post()
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('create', 'Order'))
  async create(@CurrentTenant() tenant: TenantContext, @Body() body: unknown, @Headers('idempotency-key') idempotencyKey?: string) {
    const input = createManualOrderSchema.parse(body);
    const result = await this.idempotency.run(
      { scope: 'order.create', key: idempotencyKey, ownerId: tenant.tenantId, requestBody: input },
      async () => ({ status: 201, body: await this.orders.createManualOrder(tenant.tenantId, tenant.userId, input) }),
    );
    return result.body;
  }

  @Post(':id/fulfil')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('create', 'Fulfilment'))
  async fulfil(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') idempotencyKey?: string) {
    const input = fulfilOrderSchema.parse(body ?? {});
    const key = idempotencyKey ?? `auto-${id}-${Date.now()}`;
    return this.fulfilments.submit(tenant.tenantId, tenant.userId, id, input, key);
  }

  @Post(':id/hold')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('update', 'Order'))
  async hold(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() body: unknown) {
    const input = holdOrderSchema.parse(body);
    return this.orders.hold(tenant.tenantId, tenant.userId, id, input.reason);
  }

  @Post(':id/release')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('update', 'Order'))
  async release(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.orders.release(tenant.tenantId, tenant.userId, id);
  }

  @Post(':id/cancel')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('update', 'Order'))
  async cancel(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() body: unknown) {
    const input = cancelOrderSchema.parse(body);
    return this.orders.cancel(tenant.tenantId, tenant.userId, id, input.reason);
  }

  // --- Returns / refunds / reprints (6.8) ---

  @Post(':id/returns')
  async requestReturn(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() body: unknown) {
    return this.returnsRefunds.requestReturn(tenant.tenantId, tenant.userId, id, requestReturnSchema.parse(body));
  }

  @Post(':id/returns/:returnId/decision')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('update', 'Return'))
  async decideReturn(@CurrentTenant() tenant: TenantContext, @Param('returnId') returnId: string, @Body() body: unknown) {
    return this.returnsRefunds.decideReturn(tenant.tenantId, tenant.userId, returnId, decideReturnSchema.parse(body));
  }

  @Post(':id/refund')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('create', 'Refund'))
  async refund(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') idempotencyKey?: string) {
    const input = issueRefundSchema.parse(body);
    const key = idempotencyKey ?? `auto-refund-${id}-${Date.now()}`;
    return this.returnsRefunds.issueRefund(tenant.tenantId, tenant.userId, id, input, key);
  }

  @Post(':id/reprint')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('create', 'Reprint'))
  async reprint(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') idempotencyKey?: string) {
    const input = requestReprintSchema.parse(body);
    const key = idempotencyKey ?? `auto-reprint-${id}-${Date.now()}`;
    return this.returnsRefunds.requestReprint(tenant.tenantId, tenant.userId, id, input, key);
  }

  @Get(':id/returns-refunds')
  async listReturnsRefunds(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.returnsRefunds.listForOrder(tenant.tenantId, id);
  }

  // --- Shipment / tracking (6.6) ---

  @Post(':id/fulfilments/:fulfilmentId/ship')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('update', 'Fulfilment'))
  async recordShipped(@Param('fulfilmentId') fulfilmentId: string, @CurrentTenant() tenant: TenantContext, @Body() body: unknown) {
    const input = (body ?? {}) as { carrier?: string; trackingNumber?: string; transitDays?: number };
    return this.shipments.recordShipped(tenant.tenantId, fulfilmentId, input);
  }

  @Post('shipments/:shipmentId')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('update', 'Fulfilment'))
  async updateShipment(@CurrentTenant() tenant: TenantContext, @Param('shipmentId') shipmentId: string, @Body() body: unknown) {
    return this.shipments.update(tenant.tenantId, shipmentId, updateShipmentSchema.parse(body));
  }

  @Post('shipments/:shipmentId/tracking-events')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('update', 'Fulfilment'))
  async addTrackingEvent(@CurrentTenant() tenant: TenantContext, @Param('shipmentId') shipmentId: string, @Body() body: unknown) {
    return this.shipments.addTrackingEvent(tenant.tenantId, shipmentId, recordTrackingEventSchema.parse(body), tenant.userId);
  }

  // --- Buyer messages (6.10) ---

  @Post(':id/messages')
  async sendMessage(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() body: unknown) {
    return this.buyerMessages.send(tenant.tenantId, tenant.userId, id, sendBuyerMessageSchema.parse(body));
  }

  @Get(':id/messages')
  async listMessages(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.buyerMessages.listLogs(tenant.tenantId, id);
  }

  // --- Packing slip / commercial invoice (6.9) ---

  @Get(':id/packing-slip')
  @Header('Content-Type', 'application/pdf')
  async packingSlipPdf(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Query('locale') locale: string | undefined, @Res() res: Response): Promise<void> {
    const bytes = await this.packingSlip.renderPdf(tenant.tenantId, id, 'PACKING_SLIP', locale === 'ar' ? 'ar' : 'en');
    res.setHeader('Content-Disposition', 'inline; filename="packing-slip.pdf"');
    res.send(Buffer.from(bytes));
  }

  @Get(':id/invoice')
  @Header('Content-Type', 'application/pdf')
  async invoicePdf(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Query('locale') locale: string | undefined, @Res() res: Response): Promise<void> {
    const bytes = await this.packingSlip.renderPdf(tenant.tenantId, id, 'INVOICE', locale === 'ar' ? 'ar' : 'en');
    res.setHeader('Content-Disposition', 'inline; filename="invoice.pdf"');
    res.send(Buffer.from(bytes));
  }
}
