import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type { ClientSession } from 'mongodb';
import {
  EVENT_TYPES,
  type DomainEvent,
} from '@poc/contracts';
import type { MongoContext } from '@poc/kafka-toolkit';
import { MONGO } from './providers';
import { logger } from './config';

export interface LoyaltyDoc {
  eventId: string;
  activationId: string;
  customerId: string;
  planId: string;
  status: 'ACTIVE' | 'FAILED';
  pointsAwarded?: number;
  reason?: string;
  occurredAt: string;
  receivedAt: Date;
}

@Injectable()
export class LoyaltyRepository implements OnModuleInit {
  constructor(@Inject(MONGO) private readonly mongo: MongoContext) {}

  private get collection() {
    return this.mongo.db.collection<LoyaltyDoc>('loyalty_members');
  }

  async onModuleInit(): Promise<void> {
    await this.collection.createIndex(
      { eventId: 1 },
      { unique: true, name: 'ux_loyalty_event_id' },
    );
    await this.collection.createIndex(
      { customerId: 1 },
      { name: 'ix_loyalty_customer' },
    );
    await this.collection.createIndex(
      { receivedAt: -1 },
      { name: 'ix_received' },
    );
  }

  async handle(event: DomainEvent, session: ClientSession): Promise<void> {
    switch (event.eventType) {
      case EVENT_TYPES.ActivationCompleted:
        await this.collection.insertOne(
          {
            eventId: event.eventId,
            activationId: event.correlationId,
            customerId: event.customerId,
            planId: event.payload.planId,
            status: 'ACTIVE',
            pointsAwarded: 100, // puntos de bienvenida por plan contratado
            occurredAt: event.occurredAt,
            receivedAt: new Date(),
          },
          { session },
        );
        break;
      case EVENT_TYPES.ActivationFailed:
        await this.collection.insertOne(
          {
            eventId: event.eventId,
            activationId: event.correlationId,
            customerId: event.customerId,
            planId: event.payload.planId,
            status: 'FAILED',
            reason: event.payload.reason,
            occurredAt: event.occurredAt,
            receivedAt: new Date(),
          },
          { session },
        );
        break;
      default:
        return;
    }

    logger.info('Evento registrado en loyalty-service (replay)', {
      eventId: event.eventId,
      eventType: event.eventType,
      activationId: event.correlationId,
      customerId: event.customerId,
    });
  }

  async list(limit = 50) {
    const safeLimit = Math.min(Math.max(limit, 1), 200);
    return this.collection
      .find({})
      .sort({ receivedAt: -1 })
      .limit(safeLimit)
      .toArray();
  }
}
