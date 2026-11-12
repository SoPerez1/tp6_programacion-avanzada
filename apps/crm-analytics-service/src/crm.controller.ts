import { Controller, Get, Param, Query } from '@nestjs/common';
import { EventLogRepository } from './event-log.repository';

@Controller('api/analytics')
export class InsightsController {
  constructor(private readonly repository: EventLogRepository) {}

  @Get('summary')
  summary() {
    return this.repository.summary();
  }

  @Get('events')
  events(@Query('limit') limit?: string) {
    const parsed = limit ? Number.parseInt(limit, 10) : 40;
    return this.repository.recent(Number.isFinite(parsed) ? parsed : 40);
  }

  @Get('trace/:correlationId')
  trace(@Param('correlationId') correlationId: string) {
    return this.repository.trace(correlationId);
  }
}
