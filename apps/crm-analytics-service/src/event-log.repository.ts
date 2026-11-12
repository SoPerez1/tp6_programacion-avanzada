import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type { ClientSession, WithId } from 'mongodb';
import type {
  AnalyticsEventView,
  AnalyticsSummary,
  DomainEvent,
} from '@poc/contracts';
import type { MongoContext } from '@poc/kafka-toolkit';
import { MONGO } from './providers';
import { logger } from './config';

interface EventLogDoc {
  eventId: string;
  eventType: string;
  version: number;
  correlationId: string;
  customerId: string;
  source: string;
  topic: string;
  partition: number;
  offset: string;
  occurredAt: string;
  receivedAt: Date;
  payload: unknown;
}

@Injectable()
export class EventLogRepository implements OnModuleInit {
  constructor(@Inject(MONGO) private readonly mongo: MongoContext) {}

  private get collection() {
    return this.mongo.db.collection<EventLogDoc>('event_log');
  }

  async onModuleInit(): Promise<void> {
    await this.collection.createIndex(
      { eventId: 1 },
      { unique: true, name: 'ux_event_id' },
    );
    await this.collection.createIndex(
      { correlationId: 1, occurredAt: 1 },
      { name: 'ix_correlation' },
    );
    await this.collection.createIndex(
      { receivedAt: -1 },
      { name: 'ix_received' },
    );
  }

  async handle(
    event: DomainEvent,
    meta: { topic: string; partition: number; offset: string },
    session: ClientSession,
  ): Promise<void> {
    await this.collection.insertOne(
      {
        eventId: event.eventId,
        eventType: event.eventType,
        version: event.version,
        correlationId: event.correlationId,
        customerId: event.customerId,
        source: event.source,
        topic: meta.topic,
        partition: meta.partition,
        offset: meta.offset,
        occurredAt: event.occurredAt,
        receivedAt: new Date(),
        payload: event.payload,
      },
      { session },
    );

    logger.debug('Evento registrado', {
      eventId: event.eventId,
      eventType: event.eventType,
    });
  }

  async summary(): Promise<AnalyticsSummary> {
    const [totalEvents, byType, latest, correlations] = await Promise.all([
      this.collection.countDocuments({}),
      this.collection
        .aggregate<{ _id: string; count: number }>([
          { $group: { _id: '$eventType', count: { $sum: 1 } } },
          { $sort: { count: -1, _id: 1 } },
        ])
        .toArray(),
      this.collection.find({}).sort({ receivedAt: -1 }).limit(1).toArray(),
      this.collection.distinct('correlationId'),
    ]);

    return {
      totalEvents,
      totalActivations: correlations.length,
      byType: byType.map((item) => ({
        eventType: item._id,
        count: item.count,
      })),
      lastEventAt: latest[0]?.receivedAt.toISOString(),
    };
  }

  async recent(limit = 40): Promise<AnalyticsEventView[]> {
    const safeLimit = Math.min(Math.max(limit, 1), 200);
    const documents = await this.collection
      .find({})
      .sort({ receivedAt: -1 })
      .limit(safeLimit)
      .toArray();

    return documents.map((document) => this.toView(document));
  }

  async trace(correlationId: string): Promise<AnalyticsEventView[]> {
    const documents = await this.collection
      .find({ correlationId })
      .sort({ occurredAt: 1, receivedAt: 1 })
      .limit(500)
      .toArray();

    return documents.map((document) => this.toView(document));
  }

  private toView(document: WithId<EventLogDoc>): AnalyticsEventView {
    return {
      eventId: document.eventId,
      eventType: document.eventType as AnalyticsEventView['eventType'],
      correlationId: document.correlationId,
      customerId: document.customerId,
      source: document.source,
      topic: document.topic,
      partition: document.partition,
      offset: document.offset,
      occurredAt: document.occurredAt,
      receivedAt: document.receivedAt.toISOString(),
      payload: document.payload,
    };
  }
}
