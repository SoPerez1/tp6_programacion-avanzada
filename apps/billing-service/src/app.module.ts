import { Module } from '@nestjs/common';
import { InfrastructureLifecycle } from './infrastructure.lifecycle';
import { OutboxService } from './outbox.service';
import { BillingAccountRepository } from './billing-account.repository';
import { BillingEventsConsumer } from './billing-events.consumer';
import { mongoProvider, producerProvider } from './providers';

@Module({
  providers: [
    mongoProvider,
    producerProvider,
    BillingAccountRepository,
    BillingEventsConsumer,
    OutboxService,
    InfrastructureLifecycle,
  ],
})
export class AppModule {}
