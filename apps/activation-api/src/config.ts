import { SERVICES } from '@poc/contracts';
import { createLogger, env, envBool, envInt, envList } from '@poc/kafka-toolkit';

export const logger = createLogger(SERVICES.activationApi);

export const config = {
  port: envInt('PORT', 3000),
  mongoUri: env('MONGO_URI', 'mongodb://localhost:27017/?directConnection=true'),
  mongoDb: env('MONGO_DB', 'poc_activation'),
  brokers: envList('KAFKA_BROKERS', ['localhost:29092']),
  clientId: env('KAFKA_CLIENT_ID', SERVICES.activationApi),
  groupId: env('KAFKA_GROUP_ID', 'activation-api-svc'),
  fromBeginning: envBool('KAFKA_FROM_BEGINNING', true),
  outboxPollMs: envInt('OUTBOX_POLL_MS', 500),
  uiOrigins: envList('UI_ORIGIN', ['http://localhost:5173']),
};
