import { Module } from '@nestjs/common';
import { EmailDispatcher } from './email-dispatcher';
import { InfrastructureLifecycle } from './infrastructure.lifecycle';
import { NotificationEventsConsumer } from './notification-events.consumer';
import { NotificationRepository } from './notification.repository';
import { mongoProvider, producerProvider } from './providers';

@Module({
  providers: [
    mongoProvider,
    producerProvider,
    NotificationRepository,
    EmailDispatcher,
    NotificationEventsConsumer,
    InfrastructureLifecycle,
  ],
})
export class AppModule {}
