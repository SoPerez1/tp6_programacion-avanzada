import type { Provider } from '@nestjs/common';
import {
  EventProducer,
  connectMongo,
  ensureCommonCollections,
  type MongoContext,
} from '@poc/kafka-toolkit';
import { config, logger } from './config';

export const MONGO = Symbol('MONGO');
export const PRODUCER = Symbol('PRODUCER');

export const mongoProvider: Provider = {
  provide: MONGO,
  useFactory: async (): Promise<MongoContext> => {
    const mongo = await connectMongo(config.mongoUri, config.mongoDb, logger);
    await ensureCommonCollections(mongo.db, logger);
    return mongo;
  },
};

export const producerProvider: Provider = {
  provide: PRODUCER,
  useFactory: async (): Promise<EventProducer> => {
    const producer = new EventProducer({
      brokers: config.brokers,
      clientId: config.clientId,
      logger,
    });
    await producer.connect();
    return producer;
  },
};
