import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  EVENT_TYPES,
  EVENT_VERSION,
  FAILURE_MODES,
  PLANS,
  type EventType,
} from './topics';

const envelopeBase = {
  eventId: z.string().uuid(),
  version: z.number().int().positive(),
  occurredAt: z.string().datetime({ offset: true }),
  correlationId: z.string().min(1).max(120),
  customerId: z.string().min(1).max(120),
  source: z.string().min(1).max(80),
};

const requestedSchema = z.object({
  ...envelopeBase,
  eventType: z.literal(EVENT_TYPES.ActivationRequested),
  payload: z.object({
    planId: z.enum(PLANS),
    channel: z.literal('web'),
    contactEmail: z.string().email(),
    simulateFailure: z.enum(FAILURE_MODES),
  }),
});

const billingCreatedSchema = z.object({
  ...envelopeBase,
  eventType: z.literal(EVENT_TYPES.BillingAccountCreated),
  payload: z.object({
    accountId: z.string().min(1),
    planId: z.enum(PLANS),
    status: z.literal('CREATED'),
  }),
});

const billingFailedSchema = z.object({
  ...envelopeBase,
  eventType: z.literal(EVENT_TYPES.BillingFailed),
  payload: z.object({
    reason: z.string().min(1),
  }),
});

const billingCancelledSchema = z.object({
  ...envelopeBase,
  eventType: z.literal(EVENT_TYPES.BillingAccountCancelled),
  payload: z.object({
    accountId: z.string().nullable(),
    reason: z.string().min(1),
  }),
});

const provisioningCompletedSchema = z.object({
  ...envelopeBase,
  eventType: z.literal(EVENT_TYPES.ProvisioningCompleted),
  payload: z.object({
    orderId: z.string().min(1),
    planId: z.enum(PLANS),
    resourceId: z.string().min(1),
  }),
});

const provisioningFailedSchema = z.object({
  ...envelopeBase,
  eventType: z.literal(EVENT_TYPES.ProvisioningFailed),
  payload: z.object({
    reason: z.string().min(1),
  }),
});

const completedSchema = z.object({
  ...envelopeBase,
  eventType: z.literal(EVENT_TYPES.ActivationCompleted),
  payload: z.object({
    planId: z.enum(PLANS),
    contactEmail: z.string().email(),
    billingAccountId: z.string().min(1),
    provisioningOrderId: z.string().min(1),
  }),
});

const activationFailedSchema = z.object({
  ...envelopeBase,
  eventType: z.literal(EVENT_TYPES.ActivationFailed),
  payload: z.object({
    planId: z.enum(PLANS),
    contactEmail: z.string().email(),
    failedStep: z.enum(['billing', 'provisioning']),
    reason: z.string().min(1),
  }),
});

export const domainEventSchema = z.discriminatedUnion('eventType', [
  requestedSchema,
  billingCreatedSchema,
  billingFailedSchema,
  billingCancelledSchema,
  provisioningCompletedSchema,
  provisioningFailedSchema,
  completedSchema,
  activationFailedSchema,
]);

export type DomainEvent = z.infer<typeof domainEventSchema>;
export type ActivationRequested = z.infer<typeof requestedSchema>;
export type BillingAccountCreated = z.infer<typeof billingCreatedSchema>;
export type BillingFailed = z.infer<typeof billingFailedSchema>;
export type BillingAccountCancelled = z.infer<typeof billingCancelledSchema>;
export type ProvisioningCompleted = z.infer<typeof provisioningCompletedSchema>;
export type ProvisioningFailed = z.infer<typeof provisioningFailedSchema>;
export type ActivationCompleted = z.infer<typeof completedSchema>;
export type ActivationFailed = z.infer<typeof activationFailedSchema>;

type EventFor<T extends EventType> = Extract<DomainEvent, { eventType: T }>;

export interface CreateEventInput<T extends EventType> {
  eventType: T;
  correlationId: string;
  customerId: string;
  source: string;
  payload: EventFor<T>['payload'];
  eventId?: string;
  occurredAt?: Date;
}

/**
 * Construye un sobre de evento válido, con id y timestamp nuevos por defecto.
 * El `correlationId` de la saga es el `activationId`.
 */
export function createEvent<T extends EventType>(
  input: CreateEventInput<T>,
): DomainEvent {
  const event = {
    eventId: input.eventId ?? randomUUID(),
    eventType: input.eventType,
    version: EVENT_VERSION,
    occurredAt: (input.occurredAt ?? new Date()).toISOString(),
    correlationId: input.correlationId,
    customerId: input.customerId,
    source: input.source,
    payload: input.payload,
  };

  return domainEventSchema.parse(event) as EventFor<T>;
}

export function parseDomainEvent(value: unknown): DomainEvent {
  return domainEventSchema.parse(value);
}
