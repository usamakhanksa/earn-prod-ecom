import { Injectable, NotFoundException } from '@nestjs/common';
import type { BuyerMessageType, SendBuyerMessageInput, UpsertBuyerMessageTemplateInput } from '@omnisell/shared';
import { BuyerMessageRepository } from '../repositories/buyer-message.repository';
import { OrderRepository } from '../repositories/order.repository';
import { MailerService } from '../mailer/mailer.service';

const DEFAULT_TEMPLATES: Record<BuyerMessageType, Record<'en' | 'ar', { subject: string; body: string }>> = {
  SHIPPING_DELAY: {
    en: { subject: 'A quick update on your order {{orderNumber}}', body: "Hi {{buyerName}},\n\nWe wanted to let you know your order {{orderNumber}} is taking a little longer than expected to ship. We're on it and will update you as soon as it's on its way.\n\nThank you for your patience." },
    ar: { subject: 'تحديث سريع بخصوص طلبك {{orderNumber}}', body: 'مرحباً {{buyerName}}،\n\nنود إعلامك أن طلبك {{orderNumber}} يستغرق وقتاً أطول قليلاً من المتوقع للشحن. نحن نعمل عليه وسنبقيك على اطلاع فور شحنه.\n\nشكراً لصبرك.' },
  },
  THANK_YOU: {
    en: { subject: 'Thank you for your order {{orderNumber}}!', body: 'Hi {{buyerName}},\n\nThank you for shopping with us! Your order {{orderNumber}} is being prepared with care.' },
    ar: { subject: 'شكراً لطلبك {{orderNumber}}!', body: 'مرحباً {{buyerName}}،\n\nشكراً لتسوقك معنا! يتم تحضير طلبك {{orderNumber}} بعناية.' },
  },
  REVIEW_REQUEST: {
    en: { subject: 'How did we do on order {{orderNumber}}?', body: "Hi {{buyerName}},\n\nWe hope you're loving your order {{orderNumber}}! We'd really appreciate a quick review." },
    ar: { subject: 'كيف كانت تجربتك مع طلبك {{orderNumber}}؟', body: 'مرحباً {{buyerName}}،\n\nنأمل أن يعجبك طلبك {{orderNumber}}! سنكون ممتنين لتقييمك السريع.' },
  },
};

/** Buyer message templates (featureslist.md 6.10, task 5.9) — reuses Phase
 * 1's `MailerService` transport, never a new delivery mechanism. */
@Injectable()
export class BuyerMessageService {
  constructor(
    private readonly repo: BuyerMessageRepository,
    private readonly orders: OrderRepository,
    private readonly mailer: MailerService,
  ) {}

  async send(tenantId: string, actorId: string, orderId: string, input: SendBuyerMessageInput) {
    const order = await this.orders.findById(tenantId, orderId);
    if (order === null) {
      throw new NotFoundException({ message: 'Order not found', code: 'ORDER_NOT_FOUND' });
    }
    if (order.buyerEmail === null) {
      throw new NotFoundException({ message: 'This order has no buyer email on file', code: 'ORDER_NO_BUYER_EMAIL' });
    }
    const template = (await this.repo.findTemplate(tenantId, input.templateType, input.locale)) ?? DEFAULT_TEMPLATES[input.templateType][input.locale];
    const subject = interpolate(template.subject, order);
    const body = interpolate(template.body, order);
    await this.mailer.send({ to: order.buyerEmail, subject, text: body });
    await this.repo.logSend({ tenantId, orderId, templateType: input.templateType, locale: input.locale, toEmail: order.buyerEmail, subject, sentById: actorId });
    await this.orders.addEvent({ tenantId, orderId, type: 'MESSAGE_SENT', message: `${input.templateType} sent to buyer`, actorId });
    return { ok: true };
  }

  async listLogs(tenantId: string, orderId: string) {
    return this.repo.listLogsForOrder(tenantId, orderId);
  }

  async listTemplates(tenantId: string) {
    return this.repo.listTemplates(tenantId);
  }

  async upsertTemplate(tenantId: string, input: UpsertBuyerMessageTemplateInput) {
    return this.repo.upsertTemplate({ tenantId, type: input.type, locale: input.locale, subject: input.subject, body: input.body });
  }
}

function interpolate(template: string, order: { orderNumber: string; buyerName: string | null }): string {
  return template.replace(/\{\{orderNumber\}\}/g, order.orderNumber).replace(/\{\{buyerName\}\}/g, order.buyerName ?? 'there');
}
