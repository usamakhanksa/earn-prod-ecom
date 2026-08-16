import { Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { env } from '../config/env';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Transactional mail sender (Phase 1.1 — email verification / password reset).
 * Points at Mailpit in dev (docker-compose.yml). Mirrors PrismaService's graceful
 * boot: an unreachable SMTP host logs and resolves instead of throwing, so auth
 * flows that don't strictly require delivery (e.g. tests) never crash the request.
 * The full notification centre (in-app + templated transports) lands in Phase 1.12.
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private readonly transporter: Transporter;

  constructor() {
    this.transporter = createTransport({
      host: env.MAIL_HOST,
      port: env.MAIL_PORT,
      secure: false,
      connectionTimeout: 2000,
      greetingTimeout: 2000,
      socketTimeout: 2000,
    });
  }

  async send(message: MailMessage): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: env.MAIL_FROM,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
    } catch (error) {
      this.logger.warn(`Mail delivery failed (degrading gracefully): ${String(error)}`);
    }
  }
}
