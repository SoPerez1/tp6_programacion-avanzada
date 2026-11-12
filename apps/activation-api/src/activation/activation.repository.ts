import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { ClientSession } from 'mongodb';
import {
  EVENT_TYPES,
  SERVICES,
  createEvent,
  type ActivationView,
  type DomainEvent,
} from '@poc/contracts';
import {
  enqueueOutbox,
  runInTransaction,
  type MongoContext,
} from '@poc/kafka-toolkit';
import { MONGO } from '../providers';
import { logger } from '../config';
import {
  buildActivationDocument,
  reduceActivation,
  toActivationView,
  type ActivationDoc,
  type ResolvedCreateInput,
} from './activation-state';

@Injectable()
export class ActivationRepository implements OnModuleInit {
  constructor(@Inject(MONGO) private readonly mongo: MongoContext) {}

  private get collection() {
    return this.mongo.db.collection<ActivationDoc>('activations');
  }

  async onModuleInit(): Promise<void> {
    await this.collection.createIndex({ createdAt: -1 }, { name: 'ix_created' });
    await this.collection.createIndex({ customerId: 1 }, { name: 'ix_customer' });
    await this.collection.createIndex({ status: 1 }, { name: 'ix_status' });
  }

  async create(input: ResolvedCreateInput): Promise<ActivationView> {
    const id = `act_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const createdAt = new Date();
    const requested = createEvent({
      eventType: EVENT_TYPES.ActivationRequested,
      correlationId: id,
      customerId: input.customerId,
      source: SERVICES.activationApi,
      occurredAt: createdAt,
      payload: {
        planId: input.planId,
        channel: 'web',
        contactEmail: input.contactEmail,
        simulateFailure: input.simulateFailure,
      },
    });

    const document = buildActivationDocument(
      id,
      input,
      createdAt.toISOString(),
    );

    await runInTransaction(this.mongo, async (session) => {
      await this.collection.insertOne(document, { session });
      await enqueueOutbox(this.mongo, session, requested);
    });

    logger.info('Activación creada', {
      activationId: id,
      customerId: input.customerId,
      simulateFailure: input.simulateFailure,
    });

    return toActivationView(document);
  }

  async list(limit = 20): Promise<ActivationView[]> {
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const documents = await this.collection
      .find({})
      .sort({ createdAt: -1 })
      .limit(safeLimit)
      .toArray();

    return documents.map(toActivationView);
  }

  async getById(id: string): Promise<ActivationView | null> {
    const document = await this.collection.findOne({ _id: id });
    return document ? toActivationView(document) : null;
  }

  async applyEvent(
    event: DomainEvent,
    session: ClientSession,
  ): Promise<ActivationView> {
    const current = await this.collection.findOne(
      { _id: event.correlationId },
      { session },
    );

    if (!current) {
      throw new Error(
        `No existe la activación ${event.correlationId} para ${event.eventType}`,
      );
    }

    const { doc, outgoing } = reduceActivation(current, event);

    await this.collection.replaceOne({ _id: doc._id }, doc, { session });

    for (const outgoingEvent of outgoing) {
      await enqueueOutbox(this.mongo, session, outgoingEvent);
    }

    if (outgoing.length > 0) {
      logger.info('Saga actualizada', {
        activationId: doc._id,
        status: doc.status,
        outgoing: outgoing.map((item) => item.eventType),
      });
    }

    return toActivationView(doc);
  }
}
