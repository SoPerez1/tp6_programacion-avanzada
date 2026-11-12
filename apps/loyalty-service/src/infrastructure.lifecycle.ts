import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import {
  closeMongo,
  type EventProducer,
  type MongoContext,
} from '@poc/kafka-toolkit';
import { logger } from './config';
import { MONGO, PRODUCER } from './providers';

@Injectable()
export class InfrastructureLifecycle implements OnApplicationShutdown {
  constructor(
    @Inject(MONGO) private readonly mongo: MongoContext,
    @Inject(PRODUCER) private readonly producer: EventProducer,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await this.producer.disconnect();
    await closeMongo(this.mongo, logger);
  }
}
