import { Module } from '@nestjs/common';
import { EventLogRepository } from './event-log.repository';
import { HealthController } from './health.controller';
import { InfrastructureLifecycle } from './infrastructure.lifecycle';
import { InsightsController } from './crm.controller';
import { InsightsEventsConsumer } from './crm-events.consumer';
import { mongoProvider, producerProvider } from './providers';

@Module({
  controllers: [InsightsController, HealthController],
  providers: [
    mongoProvider,
    producerProvider,
    EventLogRepository,
    InsightsEventsConsumer,
    InfrastructureLifecycle,
  ],
})
export class AppModule {}
