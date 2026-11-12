import {
  EVENT_TYPES,
  SERVICES,
  createEvent,
  type ActivationStatus,
  type ActivationView,
  type DomainEvent,
  type EventType,
  type FailureMode,
  type PlanId,
  type StepStatus,
  type TimelineEntry,
} from '@poc/contracts';

export interface ActivationStepDoc {
  status: StepStatus;
  at?: string;
  detail?: string;
  reference?: string;
}

export interface ActivationHistoryDoc {
  eventType: EventType;
  at: string;
  source: string;
  detail?: string;
}

export interface ActivationDoc {
  _id: string;
  customerId: string;
  contactEmail: string;
  planId: PlanId;
  simulateFailure: FailureMode;
  status: ActivationStatus;
  steps: {
    billing: ActivationStepDoc;
    provisioning: ActivationStepDoc;
  };
  compensation: {
    status: 'NOT_REQUIRED' | 'PENDING' | 'DONE';
    at?: string;
    detail?: string;
  };
  failure?: {
    step: 'billing' | 'provisioning';
    reason: string;
    at: string;
  };
  history: ActivationHistoryDoc[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ResolvedCreateInput {
  customerId: string;
  contactEmail: string;
  planId: PlanId;
  simulateFailure: FailureMode;
}

export function buildActivationDocument(
  id: string,
  input: ResolvedCreateInput,
  requestedAt: string,
): ActivationDoc {
  return {
    _id: id,
    customerId: input.customerId,
    contactEmail: input.contactEmail,
    planId: input.planId,
    simulateFailure: input.simulateFailure,
    status: 'PENDING',
    steps: {
      billing: { status: 'PENDING' },
      provisioning: { status: 'PENDING' },
    },
    compensation: { status: 'NOT_REQUIRED' },
    history: [
      {
        eventType: EVENT_TYPES.ActivationRequested,
        at: requestedAt,
        source: SERVICES.activationApi,
        detail: 'Solicitud de activación recibida',
      },
    ],
    createdAt: new Date(requestedAt),
    updatedAt: new Date(requestedAt),
  };
}

function stepView(step: ActivationStepDoc): ActivationView['steps']['billing'] {
  return {
    status: step.status,
    at: step.at,
    detail: step.detail,
  };
}

export function toActivationView(doc: ActivationDoc): ActivationView {
  return {
    id: doc._id,
    customerId: doc.customerId,
    contactEmail: doc.contactEmail,
    planId: doc.planId,
    simulateFailure: doc.simulateFailure,
    status: doc.status,
    steps: {
      billing: stepView(doc.steps.billing),
      provisioning: stepView(doc.steps.provisioning),
    },
    compensation: { ...doc.compensation },
    failure: doc.failure ? { ...doc.failure } : undefined,
    history: doc.history.map((entry) => ({ ...entry })) as TimelineEntry[],
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

function detailForEvent(event: DomainEvent): string {
  switch (event.eventType) {
    case EVENT_TYPES.BillingAccountCreated:
      return `Cuenta ${event.payload.accountId} creada`;
    case EVENT_TYPES.BillingFailed:
      return event.payload.reason;
    case EVENT_TYPES.BillingAccountCancelled:
      return event.payload.accountId
        ? `Cuenta ${event.payload.accountId} anulada`
        : 'No había cuenta que anular';
    case EVENT_TYPES.ProvisioningCompleted:
      return `Orden ${event.payload.orderId} aprovisionada`;
    case EVENT_TYPES.ProvisioningFailed:
      return event.payload.reason;
    default:
      return '';
  }
}

/**
 * Reduce el estado de la saga ante un resultado de billing o provisioning.
 * Es una función pura: no toca Mongo y devuelve los eventos de salida que
 * deben guardarse en el outbox dentro de la misma transacción.
 */
export function reduceActivation(
  doc: ActivationDoc,
  event: DomainEvent,
): { doc: ActivationDoc; outgoing: DomainEvent[] } {
  const next: ActivationDoc = {
    ...doc,
    steps: {
      billing: { ...doc.steps.billing },
      provisioning: { ...doc.steps.provisioning },
    },
    compensation: { ...doc.compensation },
    failure: doc.failure ? { ...doc.failure } : undefined,
    history: [...doc.history],
  };
  const outgoing: DomainEvent[] = [];
  const occurredAt = new Date(event.occurredAt);

  const isTerminal = (): boolean =>
    next.status === 'ACTIVE' || next.status === 'FAILED';

  const pushHistory = (
    eventType: EventType,
    source: string,
    detail?: string,
    at = event.occurredAt,
  ): void => {
    next.history.push({ eventType, at, source, detail });
  };

  const fail = (step: 'billing' | 'provisioning', reason: string): void => {
    if (isTerminal()) return;

    next.status = 'FAILED';
    next.failure = { step, reason, at: event.occurredAt };
    next.compensation = { status: 'PENDING' };
    next.updatedAt = occurredAt;

    pushHistory(
      EVENT_TYPES.ActivationFailed,
      SERVICES.activationApi,
      `Activación fallida en ${step}: ${reason}`,
    );

    outgoing.push(
      createEvent({
        eventType: EVENT_TYPES.ActivationFailed,
        correlationId: next._id,
        customerId: next.customerId,
        source: SERVICES.activationApi,
        occurredAt,
        payload: {
          planId: next.planId,
          contactEmail: next.contactEmail,
          failedStep: step,
          reason,
        },
      }),
    );
  };

  const tryComplete = (): void => {
    if (isTerminal()) return;
    if (
      next.steps.billing.status !== 'OK' ||
      next.steps.provisioning.status !== 'OK'
    ) {
      return;
    }

    const provisioningOrderId = next.steps.provisioning.reference ?? '';
    const billingAccountId = next.steps.billing.reference ?? '';

    next.status = 'ACTIVE';
    next.compensation = { status: 'NOT_REQUIRED' };
    next.updatedAt = occurredAt;

    pushHistory(
      EVENT_TYPES.ActivationCompleted,
      SERVICES.activationApi,
      `Plan ${next.planId} activo`,
    );

    outgoing.push(
      createEvent({
        eventType: EVENT_TYPES.ActivationCompleted,
        correlationId: next._id,
        customerId: next.customerId,
        source: SERVICES.activationApi,
        occurredAt,
        payload: {
          planId: next.planId,
          contactEmail: next.contactEmail,
          billingAccountId,
          provisioningOrderId,
        },
      }),
    );
  };

  switch (event.eventType) {
    case EVENT_TYPES.BillingAccountCreated: {
      pushHistory(event.eventType, event.source, detailForEvent(event));
      if (!isTerminal()) {
        next.steps.billing = {
          status: 'OK',
          at: event.occurredAt,
          detail: detailForEvent(event),
          reference: event.payload.accountId,
        };
        if (next.status === 'PENDING') next.status = 'IN_PROGRESS';
        next.updatedAt = occurredAt;
        tryComplete();
      }
      break;
    }

    case EVENT_TYPES.BillingFailed: {
      pushHistory(event.eventType, event.source, detailForEvent(event));
      if (!isTerminal()) {
        next.steps.billing = {
          status: 'FAILED',
          at: event.occurredAt,
          detail: event.payload.reason,
        };
        fail('billing', event.payload.reason);
      }
      break;
    }

    case EVENT_TYPES.ProvisioningCompleted: {
      pushHistory(event.eventType, event.source, detailForEvent(event));
      if (!isTerminal()) {
        next.steps.provisioning = {
          status: 'OK',
          at: event.occurredAt,
          detail: detailForEvent(event),
          reference: event.payload.orderId,
        };
        if (next.status === 'PENDING') next.status = 'IN_PROGRESS';
        next.updatedAt = occurredAt;
        tryComplete();
      }
      break;
    }

    case EVENT_TYPES.ProvisioningFailed: {
      pushHistory(event.eventType, event.source, detailForEvent(event));
      if (!isTerminal()) {
        next.steps.provisioning = {
          status: 'FAILED',
          at: event.occurredAt,
          detail: event.payload.reason,
        };
        fail('provisioning', event.payload.reason);
      }
      break;
    }

    case EVENT_TYPES.BillingAccountCancelled: {
      pushHistory(event.eventType, event.source, detailForEvent(event));
      if (next.status === 'FAILED') {
        next.compensation = {
          status: 'DONE',
          at: event.occurredAt,
          detail: detailForEvent(event),
        };
        next.updatedAt = occurredAt;
      }
      break;
    }

    default:
      break;
  }

  return { doc: next, outgoing };
}
