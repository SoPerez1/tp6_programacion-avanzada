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
import { BUSINESS_TOPICS } from '@poc/contracts';
import { config, logger } from './config';
import { MONGO, PRODUCER } from './providers';
import { EventLogRepository } from './event-log.repository';

@Injectable()
export class InsightsEventsConsumer
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly consumer: EventConsumer;

  constructor(
    @Inject(MONGO) mongo: MongoContext,
    @Inject(PRODUCER) producer: EventProducer,
    repository: EventLogRepository,
  ) {
    this.consumer = new EventConsumer({
      brokers: config.brokers,
      clientId: config.clientId,
      groupId: config.groupId,
      topics: [...BUSINESS_TOPICS],
      fromBeginning: config.fromBeginning,
      serviceName: 'insights-service',
      mongo,
      producer,
      logger,
      handler: ({ envelope, topic, partition, offset, session }) =>
        repository.handle(
          envelope,
          { topic, partition, offset },
          session,
        ),
    });
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.consumer.start();
  }

  async onApplicationShutdown(): Promise<void> {
    await this.consumer.stop();
  }
}
