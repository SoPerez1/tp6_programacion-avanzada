import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { ClientSession } from 'mongodb';
import {
  EVENT_TYPES,
  SERVICES,
  createEvent,
  type ActivationFailed,
  type ActivationRequested,
  type DomainEvent,
} from '@poc/contracts';
import { enqueueOutbox, type MongoContext } from '@poc/kafka-toolkit';
import { MONGO } from './providers';
import { logger } from './config';

interface ProvisioningOrderDoc {
  _id: string;
  activationId: string;
  customerId: string;
  status: 'ACTIVE' | 'FAILED' | 'CANCELLED';
  planId: string;
  resourceId?: string;
  createdAt: Date;
  cancelledAt?: Date;
  reason?: string;
}

interface PendingCancellationDoc {
  _id: string;
  customerId: string;
  reason: string;
  createdAt: Date;
}

@Injectable()
export class ProvisioningRepository implements OnModuleInit {
  constructor(@Inject(MONGO) private readonly mongo: MongoContext) {}

  private get orders() {
    return this.mongo.db.collection<ProvisioningOrderDoc>('provisioning_orders');
  }

  private get cancellations() {
    return this.mongo.db.collection<PendingCancellationDoc>(
      'pending_cancellations',
    );
  }

  async onModuleInit(): Promise<void> {
    await this.orders.createIndex(
      { activationId: 1 },
      { unique: true, name: 'ux_activation' },
    );
    await this.orders.createIndex({ customerId: 1 }, { name: 'ix_customer' });
  }

  async handle(event: DomainEvent, session: ClientSession): Promise<void> {
    switch (event.eventType) {
      case EVENT_TYPES.ActivationRequested:
        await this.provision(event, session);
        return;
      case EVENT_TYPES.ActivationFailed:
        await this.compensate(event, session);
        return;
      default:
        logger.warn('Evento no manejado por provisioning-service', {
          eventType: event.eventType,
        });
    }
  }

  private async provision(
    event: ActivationRequested,
    session: ClientSession,
  ): Promise<void> {
    const existing = await this.orders.findOne(
      { activationId: event.correlationId },
      { session },
    );
    if (existing) return;

    const cancellation = await this.cancellations.findOne(
      { _id: event.correlationId },
      { session },
    );
    const now = new Date();

    if (cancellation) {
      await this.orders.insertOne(
        {
          _id: `ord_${randomUUID().replace(/-/g, '').slice(0, 10)}`,
          activationId: event.correlationId,
          customerId: event.customerId,
          status: 'CANCELLED',
          planId: event.payload.planId,
          createdAt: now,
          cancelledAt: now,
          reason: cancellation.reason,
        },
        { session },
      );
      logger.info('Aprovisionamiento evitado: la activación ya había fallado', {
        activationId: event.correlationId,
      });
      return;
    }

    const orderId = `ord_${randomUUID().replace(/-/g, '').slice(0, 10)}`;

    if (event.payload.simulateFailure === 'provisioning') {
      const reason =
        'El motor de aprovisionamiento no pudo activar el plan (fallo simulado)';
      await this.orders.insertOne(
        {
          _id: orderId,
          activationId: event.correlationId,
          customerId: event.customerId,
          status: 'FAILED',
          planId: event.payload.planId,
          createdAt: now,
          reason,
        },
        { session },
      );
      await enqueueOutbox(
        this.mongo,
        session,
        createEvent({
          eventType: EVENT_TYPES.ProvisioningFailed,
          correlationId: event.correlationId,
          customerId: event.customerId,
          source: SERVICES.provisioning,
          occurredAt: now,
          payload: { reason },
        }),
      );
      logger.info('Aprovisionamiento simulado como fallido', {
        activationId: event.correlationId,
      });
      return;
    }

    const resourceId = `res_${event.payload.planId.toLowerCase()}_${randomUUID().replace(/-/g, '').slice(0, 8)}`;

    await this.orders.insertOne(
      {
        _id: orderId,
        activationId: event.correlationId,
        customerId: event.customerId,
        status: 'ACTIVE',
        planId: event.payload.planId,
        resourceId,
        createdAt: now,
      },
      { session },
    );
    await enqueueOutbox(
      this.mongo,
      session,
      createEvent({
        eventType: EVENT_TYPES.ProvisioningCompleted,
        correlationId: event.correlationId,
        customerId: event.customerId,
        source: SERVICES.provisioning,
        occurredAt: now,
        payload: {
          orderId,
          planId: event.payload.planId,
          resourceId,
        },
      }),
    );
    logger.info('Plan aprovisionado', {
      activationId: event.correlationId,
      orderId,
      resourceId,
    });
  }

  private async compensate(
    event: ActivationFailed,
    session: ClientSession,
  ): Promise<void> {
    const order = await this.orders.findOne(
      { activationId: event.correlationId },
      { session },
    );

    if (!order) {
      await this.cancellations.updateOne(
        { _id: event.correlationId },
        {
          $setOnInsert: {
            customerId: event.customerId,
            reason: event.payload.reason,
            createdAt: new Date(),
          },
        },
        { upsert: true, session },
      );
      logger.info('Compensación pendiente: orden aún no creada', {
        activationId: event.correlationId,
      });
      return;
    }

    if (order.status === 'ACTIVE') {
      await this.orders.updateOne(
        { _id: order._id, status: 'ACTIVE' },
        {
          $set: {
            status: 'CANCELLED',
            cancelledAt: new Date(),
            reason: event.payload.reason,
          },
        },
        { session },
      );
      logger.info('Orden de aprovisionamiento cancelada por compensación', {
        activationId: event.correlationId,
        orderId: order._id,
      });
    }
  }
}
