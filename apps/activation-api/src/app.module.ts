import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { InfrastructureLifecycle } from './infrastructure.lifecycle';
import { ActivationController } from './activation/activation.controller';
import { ActivationEventsConsumer } from './activation/activation-events.consumer';
import { ActivationGateway } from './activation/activation.gateway';
import { ActivationRepository } from './activation/activation.repository';
import { ActivationService } from './activation/activation.service';
import { OutboxService } from './outbox.service';
import { mongoProvider, producerProvider } from './providers';

@Module({
  controllers: [ActivationController, HealthController],
  providers: [
    mongoProvider,
    producerProvider,
    ActivationRepository,
    ActivationGateway,
    ActivationService,
    ActivationEventsConsumer,
    OutboxService,
    InfrastructureLifecycle,
  ],
})
export class AppModule {}
