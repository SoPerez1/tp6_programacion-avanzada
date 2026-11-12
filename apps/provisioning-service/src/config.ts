import { SERVICES } from '@poc/contracts';
import { createLogger, env, envBool, envInt, envList } from '@poc/kafka-toolkit';

export const logger = createLogger(SERVICES.provisioning);

export const config = {
  mongoUri: env('MONGO_URI', 'mongodb://localhost:27017/?directConnection=true'),
  mongoDb: env('MONGO_DB', 'poc_provisioning'),
  brokers: envList('KAFKA_BROKERS', ['localhost:29092']),
  clientId: env('KAFKA_CLIENT_ID', SERVICES.provisioning),
  groupId: env('KAFKA_GROUP_ID', 'provisioning-svc'),
  fromBeginning: envBool('KAFKA_FROM_BEGINNING', true),
  outboxPollMs: envInt('OUTBOX_POLL_MS', 500),
  delayMs: envInt('PROVISIONING_DELAY_MS', 1_800),
};
