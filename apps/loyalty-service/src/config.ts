import { SERVICES } from '@poc/contracts';
import { createLogger, env, envInt, envList } from '@poc/kafka-toolkit';

export const logger = createLogger(SERVICES.loyalty);

export const config = {
  port: envInt('PORT', 3005),
  mongoUri: env('MONGO_URI', 'mongodb://localhost:27017/?directConnection=true'),
  mongoDb: env('MONGO_DB', 'poc_loyalty'),
  brokers: envList('KAFKA_BROKERS', ['localhost:29092']),
  clientId: env('KAFKA_CLIENT_ID', SERVICES.loyalty),
  groupId: env('KAFKA_GROUP_ID', 'loyalty-svc'),
  uiOrigins: envList('UI_ORIGIN', ['http://localhost:5173']),
};
