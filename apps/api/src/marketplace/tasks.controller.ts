import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { TasksService } from './tasks.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUserId } from '../auth/current-user.decorator';
import { SkipAuditLog } from '../audit/skip-audit-log.decorator';

const completeTaskSchema = z.object({ validationToken: z.string().optional() });

@Controller('marketplace')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get('tasks')
  listTasks(@Query('country') country?: string) {
    return this.tasks.listTasks(country);
  }

  @Get('offers')
  listOffers(@Query('country') country?: string) {
    return this.tasks.listOffers(country);
  }

  @Post('tasks/:id/complete')
  @UseGuards(JwtAuthGuard)
  @SkipAuditLog() // high-volume earning endpoint
  completeTask(@CurrentUserId() userId: string, @Param('id') id: string, @Body() body: unknown) {
    return this.tasks.completeTask(userId, id, completeTaskSchema.parse(body));
  }

  @Post('offers/:id/complete')
  @UseGuards(JwtAuthGuard)
  @SkipAuditLog()
  completeOffer(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.tasks.completeOffer(userId, id);
  }
}