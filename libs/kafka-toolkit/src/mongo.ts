import {
  MongoClient,
  type ClientSession,
  type Db,
  type Document,
} from 'mongodb';
import { TOPIC_RETENTION_MS } from '@poc/contracts';
import type { Logger } from './logger';

export interface MongoContext {
  client: MongoClient;
  db: Db;
}

const SERVER_SELECTION_TIMEOUT_MS = 20_000;

export async function connectMongo(
  uri: string,
  dbName: string,
  logger: Logger,
): Promise<MongoContext> {
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS,
  });

  await client.connect();
  const db = client.db(dbName);
  await db.command({ ping: 1 });

  logger.info('MongoDB conectado', { database: dbName });
  return { client, db };
}

/**
 * `processed_events` y `outbox` son comunes a todos los servicios.
 * El TTL de processed_events coincide con la retención de los topics:
 * un evento más viejo que eso ya no puede volver a llegar.
 */
export async function ensureCommonCollections(
  db: Db,
  logger: Logger,
): Promise<void> {
  await db.collection('processed_events').createIndex(
    { eventId: 1 },
    { unique: true, name: 'ux_processed_event_id' },
  );
  await db.collection('processed_events').createIndex(
    { processedAt: 1 },
    {
      expireAfterSeconds: Math.floor(TOPIC_RETENTION_MS / 1000),
      name: 'ttl_processed_at',
    },
  );
  await db.collection('outbox').createIndex(
    { status: 1, createdAt: 1 },
    { name: 'ix_outbox_pending' },
  );

  logger.debug('Índices comunes asegurados');
}

export async function runInTransaction<T>(
  mongo: MongoContext,
  operation: (session: ClientSession) => Promise<T>,
): Promise<T> {
  const session = mongo.client.startSession();
  let result!: T;

  try {
    await session.withTransaction(
      async () => {
        result = await operation(session);
      },
      {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
      },
    );
    return result;
  } finally {
    await session.endSession();
  }
}

export function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: number }).code === 11000
  );
}

/** Serializa un documento de Mongo a JSON plano para la API. */
export function plainDocument<T extends Document>(document: T): T {
  return JSON.parse(JSON.stringify(document)) as T;
}

export async function closeMongo(
  mongo: MongoContext,
  logger: Logger,
): Promise<void> {
  await mongo.client.close();
  logger.info('MongoDB desconectado');
}
