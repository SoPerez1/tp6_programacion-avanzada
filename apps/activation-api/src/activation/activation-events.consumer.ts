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
import { config, logger } from '../config';
import { MONGO, PRODUCER } from '../providers';
import { ActivationRepository } from './activation.repository';
import { ActivationGateway } from './activation.gateway';

@Injectable()
export class ActivationEventsConsumer
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly consumer: EventConsumer;

  constructor(
    @Inject(MONGO) mongo: MongoContext,
    @Inject(PRODUCER) producer: EventProducer,
    private readonly repository: ActivationRepository,
    private readonly gateway: ActivationGateway,
  ) {
    this.consumer = new EventConsumer({
      brokers: config.brokers,
      clientId: config.clientId,
      groupId: config.groupId,
      topics: [TOPICS.billingEvents, TOPICS.provisioningEvents],
      fromBeginning: config.fromBeginning,
      serviceName: 'activation-api',
      mongo,
      producer,
      logger,
      handler: async ({ envelope, session }) => {
        const view = await this.repository.applyEvent(envelope, session);
        this.gateway.publish(view);
      },
    });
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.consumer.start();
  }

  async onApplicationShutdown(): Promise<void> {
    await this.consumer.stop();
  }
}
