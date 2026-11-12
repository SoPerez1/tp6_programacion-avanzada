import { SERVICES } from '@poc/contracts';
import { createLogger, env, envBool, envInt, envList } from '@poc/kafka-toolkit';

export const logger = createLogger(SERVICES.notification);

export const config = {
  mongoUri: env('MONGO_URI', 'mongodb://localhost:27017/?directConnection=true'),
  mongoDb: env('MONGO_DB', 'mn_notifications'),
  brokers: envList('KAFKA_BROKERS', ['localhost:29092']),
  clientId: env('KAFKA_CLIENT_ID', SERVICES.notification),
  groupId: env('KAFKA_GROUP_ID', 'notification-svc'),
  fromBeginning: envBool('KAFKA_FROM_BEGINNING', true),
  outboxPollMs: envInt('OUTBOX_POLL_MS', 500),
  smtpHost: env('SMTP_HOST', 'localhost'),
  smtpPort: envInt('SMTP_PORT', 1025),
  mailFrom: env('MAIL_FROM', 'onboarding@mercado-norte.test'),
  mailIntervalMs: envInt('MAIL_INTERVAL_MS', 500),
};
