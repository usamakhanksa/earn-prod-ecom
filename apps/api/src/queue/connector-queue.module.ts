import { Module } from '@nestjs/common';
import { ConnectorQueueService } from './connector-queue.service';

@Module({
  providers: [ConnectorQueueService],
  exports: [ConnectorQueueService],
})
export class ConnectorQueueModule {}
