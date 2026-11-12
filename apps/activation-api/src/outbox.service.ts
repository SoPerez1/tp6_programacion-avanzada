import {
  Inject,
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import {
  OutboxRelay,
  type EventProducer,
  type MongoContext,
} from '@poc/kafka-toolkit';
import { config, logger } from './config';
import { MONGO, PRODUCER } from './providers';

@Injectable()
export class OutboxService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly relay: OutboxRelay;

  constructor(
    @Inject(MONGO) mongo: MongoContext,
    @Inject(PRODUCER) producer: EventProducer,
  ) {
    this.relay = new OutboxRelay({
      mongo,
      producer,
      logger,
      serviceName: 'activation-api',
      pollMs: config.outboxPollMs,
    });
  }

  onApplicationBootstrap(): void {
    this.relay.start();
  }

  async onApplicationShutdown(): Promise<void> {
    await this.relay.stop();
  }
}
