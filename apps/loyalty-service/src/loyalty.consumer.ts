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
import { LoyaltyRepository } from './loyalty.repository';

/**
 * Consumidor nuevo, con su propio group y `auto.offset.reset=earliest`.
 * Al levantarlo procesa todo el historial de activation.events sin tocar
 * a los consumidores existentes. Es el escenario 5 de la demo.
 */
@Injectable()
export class LoyaltyConsumer
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly consumer: EventConsumer;

  constructor(
    @Inject(MONGO) mongo: MongoContext,
    @Inject(PRODUCER) producer: EventProducer,
    repository: LoyaltyRepository,
  ) {
    this.consumer = new EventConsumer({
      brokers: config.brokers,
      clientId: config.clientId,
      groupId: config.groupId,
      topics: [TOPICS.activationEvents],
      fromBeginning: true,
      serviceName: 'loyalty-service',
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
