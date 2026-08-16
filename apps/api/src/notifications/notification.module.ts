import { Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { NotificationRepository } from '../repositories/notification.repository';
import { NotificationPreferenceRepository } from '../repositories/notification-preference.repository';
import { MailerModule } from '../mailer/mailer.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [MailerModule, AuthModule],
  controllers: [NotificationController],
  providers: [NotificationService, NotificationRepository, NotificationPreferenceRepository],
  exports: [NotificationService],
})
export class NotificationModule {}
