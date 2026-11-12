import { SERVICES } from '@poc/contracts';
import { createLogger, env, envBool, envInt, envList } from '@poc/kafka-toolkit';

export const logger = createLogger(SERVICES.crmAnalytics);

export const config = {
  port: envInt('PORT', 3004),
  mongoUri: env('MONGO_URI', 'mongodb://localhost:27017/?directConnection=true'),
  mongoDb: env('MONGO_DB', 'poc_crm_analytics'),
  brokers: envList('KAFKA_BROKERS', ['localhost:29092']),
  clientId: env('KAFKA_CLIENT_ID', SERVICES.crmAnalytics),
  groupId: env('KAFKA_GROUP_ID', 'crm-analytics-svc'),
  fromBeginning: envBool('KAFKA_FROM_BEGINNING', true),
  uiOrigins: envList('UI_ORIGIN', ['http://localhost:5173']),
};
