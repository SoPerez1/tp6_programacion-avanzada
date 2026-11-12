import { Module } from '@nestjs/common';
import { InfrastructureLifecycle } from './infrastructure.lifecycle';
import { OutboxService } from './outbox.service';
import { ProvisioningEventsConsumer } from './provisioning-events.consumer';
import { ProvisioningRepository } from './provisioning.repository';
import { mongoProvider, producerProvider } from './providers';

@Module({
  providers: [
    mongoProvider,
    producerProvider,
    ProvisioningRepository,
    ProvisioningEventsConsumer,
    OutboxService,
    InfrastructureLifecycle,
  ],
})
export class AppModule {}
