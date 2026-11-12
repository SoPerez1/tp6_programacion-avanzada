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

export interface BillingAccountDoc {
  _id: string;
  activationId: string;
  customerId: string;
  status: 'CREATED' | 'CANCELLED' | 'FAILED';
  createdAt: Date;
  closedAt?: Date;
  cancellationNotifiedAt?: Date;
  reason?: string;
}

interface PendingCancellationDoc {
  _id: string;
  customerId: string;
  reason: string;
  createdAt: Date;
}

@Injectable()
export class BillingAccountRepository implements OnModuleInit {
  constructor(@Inject(MONGO) private readonly mongo: MongoContext) {}

  private get accounts() {
    return this.mongo.db.collection<BillingAccountDoc>('billing_accounts');
  }

  private get cancellations() {
    return this.mongo.db.collection<PendingCancellationDoc>(
      'pending_cancellations',
    );
  }

  async onModuleInit(): Promise<void> {
    await this.accounts.createIndex(
      { activationId: 1 },
      { unique: true, name: 'ux_activation' },
    );
    await this.accounts.createIndex({ customerId: 1 }, { name: 'ix_customer' });
  }

  async handle(event: DomainEvent, session: ClientSession): Promise<void> {
    switch (event.eventType) {
      case EVENT_TYPES.ActivationRequested:
        await this.openAccount(event, session);
        return;
      case EVENT_TYPES.ActivationFailed:
        await this.compensate(event, session);
        return;
      default:
        logger.warn('Evento no manejado por billing-service', {
          eventType: event.eventType,
        });
    }
  }

  private async openAccount(
    event: ActivationRequested,
    session: ClientSession,
  ): Promise<void> {
    const existing = await this.accounts.findOne(
      { activationId: event.correlationId },
      { session },
    );
    if (existing) return;

    const cancellation = await this.cancellations.findOne(
      { _id: event.correlationId },
      { session },
    );
    const accountId = `bil_${randomUUID().replace(/-/g, '').slice(0, 10)}`;
    const now = new Date();

    if (cancellation) {
      const account: BillingAccountDoc = {
        _id: accountId,
        activationId: event.correlationId,
        customerId: event.customerId,
        status: 'CANCELLED',
        createdAt: now,
        closedAt: now,
        reason: cancellation.reason,
      };
      await this.accounts.insertOne(account, { session });
      await enqueueOutbox(
        this.mongo,
        session,
        createEvent({
          eventType: EVENT_TYPES.BillingAccountCancelled,
          correlationId: event.correlationId,
          customerId: event.customerId,
          source: SERVICES.billing,
          occurredAt: now,
          payload: { accountId, reason: cancellation.reason },
        }),
      );
      logger.info('Cuenta creada ya anulada por compensación tardía', {
        activationId: event.correlationId,
        accountId,
      });
      return;
    }

    if (event.payload.simulateFailure === 'billing') {
      const reason =
        'El motor de facturación rechazó la cuenta (fallo simulado)';
      await this.accounts.insertOne(
        {
          _id: accountId,
          activationId: event.correlationId,
          customerId: event.customerId,
          status: 'FAILED',
          createdAt: now,
          reason,
        },
        { session },
      );
      await enqueueOutbox(
        this.mongo,
        session,
        createEvent({
          eventType: EVENT_TYPES.BillingFailed,
          correlationId: event.correlationId,
          customerId: event.customerId,
          source: SERVICES.billing,
          occurredAt: now,
          payload: { reason },
        }),
      );
      logger.info('Apertura de cuenta simulada como fallida', {
        activationId: event.correlationId,
      });
      return;
    }

    await this.accounts.insertOne(
      {
        _id: accountId,
        activationId: event.correlationId,
        customerId: event.customerId,
        status: 'CREATED',
        createdAt: now,
      },
      { session },
    );
    await enqueueOutbox(
      this.mongo,
      session,
      createEvent({
        eventType: EVENT_TYPES.BillingAccountCreated,
        correlationId: event.correlationId,
        customerId: event.customerId,
        source: SERVICES.billing,
        occurredAt: now,
        payload: {
          accountId,
          planId: event.payload.planId,
          status: 'CREATED',
        },
      }),
    );
    logger.info('Cuenta de facturación creada', {
      activationId: event.correlationId,
      accountId,
    });
  }

  private async compensate(
    event: ActivationFailed,
    session: ClientSession,
  ): Promise<void> {
    const account = await this.accounts.findOne(
      { activationId: event.correlationId },
      { session },
    );

    if (!account) {
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
      logger.info('Compensación pendiente: todavía no existe la cuenta', {
        activationId: event.correlationId,
      });
      return;
    }

    const now = new Date();

    if (account.status === 'CREATED') {
      await this.accounts.updateOne(
        { _id: account._id, status: 'CREATED' },
        {
          $set: {
            status: 'CANCELLED',
            closedAt: now,
            cancellationNotifiedAt: now,
            reason: event.payload.reason,
          },
        },
        { session },
      );
      await this.enqueueCancelled(
        event,
        session,
        account._id,
        event.payload.reason,
        now,
      );
      logger.info('Cuenta de facturación anulada por compensación', {
        activationId: event.correlationId,
        accountId: account._id,
      });
      return;
    }

    if (account.status === 'FAILED' && !account.cancellationNotifiedAt) {
      await this.accounts.updateOne(
        { _id: account._id, cancellationNotifiedAt: { $exists: false } },
        { $set: { cancellationNotifiedAt: now } },
        { session },
      );
      await this.enqueueCancelled(
        event,
        session,
        null,
        'La cuenta nunca llegó a crearse',
        now,
      );
    }
  }

  private async enqueueCancelled(
    event: ActivationFailed,
    session: ClientSession,
    accountId: string | null,
    reason: string,
    occurredAt: Date,
  ): Promise<void> {
    await enqueueOutbox(
      this.mongo,
      session,
      createEvent({
        eventType: EVENT_TYPES.BillingAccountCancelled,
        correlationId: event.correlationId,
        customerId: event.customerId,
        source: SERVICES.billing,
        occurredAt,
        payload: { accountId, reason },
      }),
    );
  }
}
