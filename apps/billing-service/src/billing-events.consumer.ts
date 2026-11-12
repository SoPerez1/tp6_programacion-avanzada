import {
  Inject,
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import {
  EventConsumer,
  sleep,
  type EventProducer,
  type MongoContext,
} from '@poc/kafka-toolkit';
import { EVENT_TYPES, TOPICS } from '@poc/contracts';
import { config, logger } from './config';
import { MONGO, PRODUCER } from './providers';
import { BillingAccountRepository } from './billing-account.repository';

@Injectable()
export class BillingEventsConsumer
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly consumer: EventConsumer;

  constructor(
    @Inject(MONGO) mongo: MongoContext,
    @Inject(PRODUCER) producer: EventProducer,
    repository: BillingAccountRepository,
  ) {
    this.consumer = new EventConsumer({
      brokers: config.brokers,
      clientId: config.clientId,
      groupId: config.groupId,
      topics: [TOPICS.activationRequested, TOPICS.activationEvents],
      fromBeginning: config.fromBeginning,
      serviceName: 'billing-service',
      mongo,
      producer,
      logger,
      preProcess: async (envelope) => {
        if (envelope.eventType === EVENT_TYPES.ActivationRequested) {
          await sleep(config.delayMs);
        }
      },
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
