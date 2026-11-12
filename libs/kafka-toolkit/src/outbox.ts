import type { ClientSession, Collection, ObjectId } from 'mongodb';
import {
  topicForEvent,
  type DomainEvent,
  type EventType,
} from '@poc/contracts';
import type { Logger } from './logger';
import type { EventProducer } from './producer';
import type { MongoContext } from './mongo';

interface OutboxDocument {
  _id?: ObjectId;
  topic: string;
  key: string;
  envelope: DomainEvent;
  status: 'PENDING' | 'SENT';
  attempts: number;
  createdAt: Date;
  sentAt?: Date;
  lastAttemptAt?: Date;
  lastError?: string;
}

/**
 * Guarda el evento en la misma transacción que el cambio de estado.
 * El relay lo publica después; si el proceso se cae entre ambas cosas,
 * el evento sigue pendiente y se publica al reiniciar.
 */
export async function enqueueOutbox(
  mongo: MongoContext,
  session: ClientSession,
  event: DomainEvent,
  topic: string = topicForEvent(event.eventType as EventType),
): Promise<void> {
  const document: OutboxDocument = {
    topic,
    key: event.customerId,
    envelope: event,
    status: 'PENDING',
    attempts: 0,
    createdAt: new Date(),
  };

  await mongo.db
    .collection<OutboxDocument>('outbox')
    .insertOne(document, { session });
}

export interface OutboxRelayOptions {
  mongo: MongoContext;
  producer: EventProducer;
  serviceName: string;
  logger: Logger;
  pollMs?: number;
}

/**
 * Lee `outbox` cada 500 ms, publica los pendientes y los marca como enviados.
 * La publicación es "al menos una vez": si el proceso cae después de publicar
 * y antes de marcar, el evento se reenvía. Los consumidores son idempotentes.
 */
export class OutboxRelay {
  private readonly collection: Collection<OutboxDocument>;
  private timer?: NodeJS.Timeout;
  private ticking = false;
  private stopped = true;

  constructor(private readonly options: OutboxRelayOptions) {
    this.collection = options.mongo.db.collection<OutboxDocument>('outbox');
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    const pollMs = this.options.pollMs ?? 500;

    this.timer = setInterval(() => {
      void this.tick();
    }, pollMs);

    void this.tick();
    this.options.logger.info('Outbox relay iniciado', { pollMs });
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.options.logger.info('Outbox relay detenido');
  }

  private async tick(): Promise<void> {
    if (this.ticking || this.stopped) return;
    this.ticking = true;

    try {
      const pending = await this.collection
        .find({ status: 'PENDING' })
        .sort({ createdAt: 1 })
        .limit(50)
        .toArray();

      for (const record of pending) {
        try {
          await this.options.producer.sendEvent(record.topic, record.envelope);
          await this.collection.updateOne(
            { _id: record._id, status: 'PENDING' },
            {
              $set: { status: 'SENT', sentAt: new Date() },
              $inc: { attempts: 1 },
            },
          );

          this.options.logger.info('Evento de outbox publicado', {
            eventId: record.envelope.eventId,
            eventType: record.envelope.eventType,
            topic: record.topic,
            attempts: record.attempts + 1,
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);

          await this.collection.updateOne(
            { _id: record._id },
            {
              $inc: { attempts: 1 },
              $set: {
                lastAttemptAt: new Date(),
                lastError: message.slice(0, 1_000),
              },
            },
          );

          this.options.logger.error('No se pudo publicar el outbox', {
            eventId: record.envelope.eventId,
            error: message,
          });
          // Kafka parece caído: se reintenta en el próximo ciclo.
          break;
        }
      }
    } finally {
      this.ticking = false;
    }
  }
}
