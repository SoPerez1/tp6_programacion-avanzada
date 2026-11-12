import {
  Inject,
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import {
  EventConsumer,
  type EventProducer,
  type MongoContext,
} from '@poc/kafka-toolkit';
import { TOPICS } from '@poc/contracts';
import { config, logger } from './config';
import { MONGO, PRODUCER } from './providers';
import { NotificationRepository } from './notification.repository';

@Injectable()
export class NotificationEventsConsumer
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly consumer: EventConsumer;

  constructor(
    @Inject(MONGO) mongo: MongoContext,
    @Inject(PRODUCER) producer: EventProducer,
    repository: NotificationRepository,
  ) {
    this.consumer = new EventConsumer({
      brokers: config.brokers,
      clientId: config.clientId,
      groupId: config.groupId,
      topics: [TOPICS.activationEvents],
      fromBeginning: config.fromBeginning,
      serviceName: 'notification-service',
      mongo,
      producer,
      logger,
      handler: ({ envelope, session }) => repository.handle(envelope, session),
    });
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.consumer.start();
  }

  async onApplicationShutdown(): Promise<void> {
    await this.consumer.stop();
  }
}
