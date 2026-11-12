import {
  Kafka,
  logLevel,
  type Consumer,
  type EachMessagePayload,
  type KafkaMessage,
} from 'kafkajs';
import type { ClientSession } from 'mongodb';
import {
  parseDomainEvent,
  type DomainEvent,
} from '@poc/contracts';
import {
  isDuplicateKeyError,
  runInTransaction,
  type MongoContext,
} from './mongo';
import type { Logger } from './logger';
import { sleep } from './env';
import type { EventProducer } from './producer';

export interface EventHandlerContext {
  envelope: DomainEvent;
  topic: string;
  partition: number;
  offset: string;
  message: KafkaMessage;
  session: ClientSession;
}

export type EventHandler = (context: EventHandlerContext) => Promise<void>;

export interface EventConsumerOptions {
  brokers: string[];
  clientId: string;
  groupId: string;
  topics: string[];
  fromBeginning?: boolean;
  serviceName: string;
  mongo: MongoContext;
  producer: EventProducer;
  logger: Logger;
  handler: EventHandler;
  /** Trabajo previo a la transacción (por ejemplo, simular latencia externa). */
  preProcess?: (envelope: DomainEvent) => Promise<void>;
  /** Intentos extra después del primero. Por defecto 1s, 2s y 4s. */
  retryDelaysMs?: number[];
}

const DEFAULT_RETRY_DELAYS_MS = [1_000, 2_000, 4_000];

/**
 * Consumidor con commit manual, idempotencia transaccional, reintentos
 * exponenciales y DLQ. Todo servicio que consume eventos usa esta clase.
 */
export class EventConsumer {
  private readonly consumer: Consumer;
  private running = false;

  constructor(private readonly options: EventConsumerOptions) {
    const kafka = new Kafka({
      clientId: options.clientId,
      brokers: options.brokers,
      logLevel: logLevel.ERROR,
      retry: { initialRetryTime: 300, retries: 10 },
      connectionTimeout: 5_000,
    });

    this.consumer = kafka.consumer({
      groupId: options.groupId,
      allowAutoTopicCreation: false,
      sessionTimeout: 30_000,
      heartbeatInterval: 3_000,
    });

    this.consumer.on('consumer.crash', (event) => {
      options.logger.error('Consumer crash', {
        groupId: options.groupId,
        error: event.payload.error,
      });
    });
  }

  async start(): Promise<void> {
    if (this.running) return;

    await this.consumer.connect();
    await this.consumer.subscribe({
      topics: this.options.topics,
      fromBeginning: this.options.fromBeginning ?? false,
    });

    // `run` resuelve recién al detener el consumer: no se espera acá.
    void this.consumer
      .run({
        autoCommit: false,
        partitionsConsumedConcurrently: 1,
        eachMessage: (payload) => this.processMessage(payload),
      })
      .catch((error: unknown) => {
        this.options.logger.error('El consumer se detuvo por un error', {
          groupId: this.options.groupId,
          error,
        });
      });

    this.running = true;
    this.options.logger.info('Consumer iniciado', {
      groupId: this.options.groupId,
      topics: this.options.topics,
      fromBeginning: this.options.fromBeginning ?? false,
    });
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;
    await this.consumer.disconnect();
    this.options.logger.info('Consumer detenido', {
      groupId: this.options.groupId,
    });
  }

  private async processMessage(payload: EachMessagePayload): Promise<void> {
    const { topic, partition, message } = payload;
    const rawValue = message.value?.toString() ?? '';
    const key = message.key?.toString();
    const startedAt = Date.now();

    let envelope: DomainEvent;
    try {
      envelope = parseDomainEvent(JSON.parse(rawValue));
    } catch (error) {
      this.options.logger.error('Evento inválido, se envía a DLQ', {
        topic,
        partition,
        offset: message.offset,
        error,
      });
      await this.sendToDlq({
        topic,
        rawValue,
        key,
        message,
        error,
        attempts: 0,
      });
      await this.commit(topic, partition, message.offset);
      return;
    }

    const alreadyProcessed = await this.options.mongo.db
      .collection('processed_events')
      .findOne({ eventId: envelope.eventId });

    if (alreadyProcessed) {
      this.options.logger.info('Evento duplicado, se omite', {
        eventId: envelope.eventId,
        eventType: envelope.eventType,
        groupId: this.options.groupId,
      });
      await this.commit(topic, partition, message.offset);
      return;
    }

    const delays = this.options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
    let lastError: unknown;

    for (let attempt = 0; attempt <= delays.length; attempt += 1) {
      try {
        if (attempt > 0) {
          this.options.logger.warn('Reintentando evento', {
            eventId: envelope.eventId,
            eventType: envelope.eventType,
            attempt,
            delayMs: delays[attempt - 1],
          });
          await sleep(delays[attempt - 1]);
        }

        await this.options.preProcess?.(envelope);

        await runInTransaction(this.options.mongo, async (session) => {
          await this.options.mongo.db.collection('processed_events').insertOne(
            {
              eventId: envelope.eventId,
              eventType: envelope.eventType,
              correlationId: envelope.correlationId,
              customerId: envelope.customerId,
              topic,
              partition,
              offset: message.offset,
              processedAt: new Date(),
            },
            { session },
          );

          await this.options.handler({
            envelope,
            topic,
            partition,
            offset: message.offset,
            message,
            session,
          });
        });

        this.options.logger.info('Evento procesado', {
          eventId: envelope.eventId,
          eventType: envelope.eventType,
          groupId: this.options.groupId,
          durationMs: Date.now() - startedAt,
        });
        await this.commit(topic, partition, message.offset);
        return;
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          this.options.logger.info('Evento ya aplicado (clave duplicada)', {
            eventId: envelope.eventId,
            eventType: envelope.eventType,
            groupId: this.options.groupId,
          });
          await this.commit(topic, partition, message.offset);
          return;
        }

        lastError = error;
        this.options.logger.warn('Fallo al procesar evento', {
          eventId: envelope.eventId,
          eventType: envelope.eventType,
          attempt: attempt + 1,
          maxAttempts: delays.length + 1,
          error,
        });
      }
    }

    await this.sendToDlq({
      topic,
      rawValue,
      key,
      message,
      error: lastError,
      attempts: delays.length + 1,
    });
    await this.commit(topic, partition, message.offset);
  }

  private async sendToDlq(input: {
    topic: string;
    rawValue: string;
    key?: string;
    message: KafkaMessage;
    error: unknown;
    attempts: number;
  }): Promise<void> {
    try {
      await this.options.producer.sendToDlq({
        originTopic: input.topic,
        rawValue: input.rawValue,
        key: input.key,
        headers: input.message.headers ?? {},
        error: input.error,
        attempts: input.attempts,
      });
    } catch (error) {
      // Sin DLQ no confirmamos el offset: preferimos reentregar antes que
      // perder el mensaje silenciosamente.
      this.options.logger.error('No se pudo publicar en DLQ', {
        topic: input.topic,
        error,
      });
      throw error;
    }
  }

  private async commit(
    topic: string,
    partition: number,
    offset: string,
  ): Promise<void> {
    await this.consumer.commitOffsets([
      {
        topic,
        partition,
        offset: (BigInt(offset) + 1n).toString(),
      },
    ]);
  }
}
