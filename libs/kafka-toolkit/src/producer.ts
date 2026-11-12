import { Kafka, logLevel, type Producer } from 'kafkajs';
import {
  dlqTopic,
  type BusinessTopic,
  type DomainEvent,
} from '@poc/contracts';
import type { Logger } from './logger';

export interface EventProducerOptions {
  brokers: string[];
  clientId: string;
  logger: Logger;
}

export type KafkaHeaders = Record<string, string>;

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function firstHeader(
  value: string | Buffer | Array<string | Buffer> | undefined,
): string | undefined {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) {
    const first = value[0];
    return first === undefined ? undefined : first.toString();
  }
  return value.toString();
}

/**
 * Producer único del servicio. Los eventos se publican con la clave
 * `customerId`, que es también la clave de partición: todos los eventos
 * de un cliente quedan ordenados en la misma partición.
 */
export class EventProducer {
  private readonly producer: Producer;
  private connected = false;

  constructor(private readonly options: EventProducerOptions) {
    const kafka = new Kafka({
      clientId: options.clientId,
      brokers: options.brokers,
      logLevel: logLevel.ERROR,
      retry: { initialRetryTime: 300, retries: 10 },
      connectionTimeout: 5_000,
    });

    this.producer = kafka.producer({
      idempotent: true,
      maxInFlightRequests: 1,
      allowAutoTopicCreation: false,
    });

    this.producer.on('producer.disconnect', () => {
      this.connected = false;
      options.logger.warn('Kafka producer desconectado');
    });
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    await this.producer.connect();
    this.connected = true;
    this.options.logger.info('Kafka producer conectado', {
      brokers: this.options.brokers,
    });
  }

  async sendEvent(topic: BusinessTopic | string, event: DomainEvent): Promise<void> {
    await this.sendRaw(topic, event.customerId, JSON.stringify(event), {
      eventId: event.eventId,
      eventType: event.eventType,
      version: String(event.version),
      correlationId: event.correlationId,
      customerId: event.customerId,
      source: event.source,
    });
  }

  async sendRaw(
    topic: string,
    key: string,
    value: string,
    headers: KafkaHeaders,
  ): Promise<void> {
    if (!this.connected) await this.connect();

    await this.producer.send({
      topic,
      messages: [
        {
          key,
          value,
          headers,
        },
      ],
    });
  }

  /**
   * Publica el mensaje original (sin transformar) en <topic>.dlq junto al
   * motivo del error. Un mensaje roto no frena el resto de la partición.
   */
  async sendToDlq(input: {
    originTopic: string;
    rawValue: string;
    key?: string;
    headers: Record<string, string | Buffer | Array<string | Buffer> | undefined>;
    error: unknown;
    attempts: number;
  }): Promise<void> {
    const eventId = firstHeader(input.headers.eventId) ?? 'unknown';
    const correlationId = firstHeader(input.headers.correlationId) ?? 'unknown';
    const customerId =
      firstHeader(input.headers.customerId) ?? input.key ?? 'unknown';
    const errorMessage = describeError(input.error).slice(0, 1_500);

    await this.sendRaw(
      dlqTopic(input.originTopic),
      customerId,
      input.rawValue,
      {
        'x-origin-topic': input.originTopic,
        'x-original-event-id': eventId,
        'x-correlation-id': correlationId,
        'x-attempts': String(input.attempts),
        'x-failed-at': new Date().toISOString(),
        'x-error': errorMessage,
      },
    );

    this.options.logger.error('Mensaje enviado a DLQ', {
      topic: dlqTopic(input.originTopic),
      eventId,
      correlationId,
      attempts: input.attempts,
      error: errorMessage,
    });
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;
    await this.producer.disconnect();
    this.connected = false;
    this.options.logger.info('Kafka producer desconectado');
  }
}
