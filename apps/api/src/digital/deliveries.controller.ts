import { Controller, Get, Ip, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { DeliveryService } from './delivery.service';

/**
 * Public redemption endpoint (task 5.10/7.2) — the buyer clicks this link
 * from their email/download page; there is no OmniSell session to require
 * here (the buyer may not even have an account, e.g. a guest checkout on a
 * connected storefront). The opaque token itself is the sole credential;
 * `DeliveryService.redeem` enforces TTL/download-count/IP caps and audit-
 * logs every attempt, allowed or denied.
 */
@Controller('deliveries')
export class DeliveriesController {
  constructor(private readonly delivery: DeliveryService) {}

  @Get('redeem/:token')
  async redeem(@Param('token') token: string, @Ip() ip: string, @Res() res: Response): Promise<void> {
    const result = await this.delivery.redeem(token, ip);
    if ('denied' in result) {
      res.status(403).json({ type: 'about:blank', title: 'Delivery link denied', status: 403, code: result.denied });
      return;
    }
    res.redirect(302, result.url);
  }
}
