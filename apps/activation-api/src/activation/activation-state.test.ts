import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EVENT_TYPES,
  SERVICES,
  createEvent,
  type DomainEvent,
} from '@poc/contracts';
import {
  buildActivationDocument,
  reduceActivation,
  toActivationView,
} from './activation-state';

const CREATED_AT = '2026-05-01T12:00:00.000Z';
const LATER = '2026-05-01T12:00:01.000Z';

function newDocument() {
  return buildActivationDocument(
    'act_test',
    {
      customerId: 'C-1234',
      contactEmail: 'cliente@demo.test',
      planId: 'PLAN_DIGITAL',
      simulateFailure: 'none',
    },
    CREATED_AT,
  );
}

function billingCreated(at = LATER): DomainEvent {
  return createEvent({
    eventType: EVENT_TYPES.BillingAccountCreated,
    correlationId: 'act_test',
    customerId: 'C-1234',
    source: SERVICES.billing,
    occurredAt: new Date(at),
    payload: { accountId: 'bil_123', planId: 'PLAN_DIGITAL', status: 'CREATED' },
  });
}

function billingFailed(at = LATER): DomainEvent {
  return createEvent({
    eventType: EVENT_TYPES.BillingFailed,
    correlationId: 'act_test',
    customerId: 'C-1234',
    source: SERVICES.billing,
    occurredAt: new Date(at),
    payload: { reason: 'El motor de facturación rechazó la cuenta' },
  });
}

function billingCancelled(at = LATER): DomainEvent {
  return createEvent({
    eventType: EVENT_TYPES.BillingAccountCancelled,
    correlationId: 'act_test',
    customerId: 'C-1234',
    source: SERVICES.billing,
    occurredAt: new Date(at),
    payload: { accountId: 'bil_123', reason: 'Activación cancelada' },
  });
}

function provisioningCompleted(at = LATER): DomainEvent {
  return createEvent({
    eventType: EVENT_TYPES.ProvisioningCompleted,
    correlationId: 'act_test',
    customerId: 'C-1234',
    source: SERVICES.provisioning,
    occurredAt: new Date(at),
    payload: {
      orderId: 'ord_123',
      planId: 'PLAN_DIGITAL',
      resourceId: 'res_123',
    },
  });
}

function provisioningFailed(at = LATER): DomainEvent {
  return createEvent({
    eventType: EVENT_TYPES.ProvisioningFailed,
    correlationId: 'act_test',
    customerId: 'C-1234',
    source: SERVICES.provisioning,
    occurredAt: new Date(at),
    payload: { reason: 'El aprovisionamiento falló' },
  });
}

test('un camino feliz termina ACTIVE recién cuando responden los dos servicios', () => {
  const first = reduceActivation(newDocument(), billingCreated());

  assert.equal(first.doc.status, 'IN_PROGRESS');
  assert.equal(first.doc.steps.billing.status, 'OK');
  assert.equal(first.doc.steps.provisioning.status, 'PENDING');
  assert.equal(first.outgoing.length, 0);

  const second = reduceActivation(first.doc, provisioningCompleted());

  assert.equal(second.doc.status, 'ACTIVE');
  assert.equal(second.doc.steps.provisioning.status, 'OK');
  assert.equal(second.doc.compensation.status, 'NOT_REQUIRED');
  assert.equal(second.outgoing.length, 1);
  assert.equal(second.outgoing[0].eventType, EVENT_TYPES.ActivationCompleted);
  assert.equal(second.outgoing[0].correlationId, 'act_test');
});

test('el orden de las respuestas no cambia el resultado final', () => {
  const first = reduceActivation(newDocument(), provisioningCompleted());

  assert.equal(first.doc.status, 'IN_PROGRESS');
  assert.equal(first.outgoing.length, 0);

  const second = reduceActivation(first.doc, billingCreated());

  assert.equal(second.doc.status, 'ACTIVE');
  assert.equal(second.outgoing[0].eventType, EVENT_TYPES.ActivationCompleted);
});

test('un fallo de billing deja la compensación PENDING hasta que se anula la cuenta', () => {
  const failed = reduceActivation(newDocument(), billingFailed());

  assert.equal(failed.doc.status, 'FAILED');
  assert.equal(failed.doc.failure?.step, 'billing');
  assert.equal(failed.doc.compensation.status, 'PENDING');
  assert.equal(failed.outgoing.length, 1);
  assert.equal(failed.outgoing[0].eventType, EVENT_TYPES.ActivationFailed);

  const compensated = reduceActivation(failed.doc, billingCancelled());

  assert.equal(compensated.doc.status, 'FAILED');
  assert.equal(compensated.doc.compensation.status, 'DONE');
  assert.equal(compensated.outgoing.length, 0);
});

test('un fallo de provisioning compensa la cuenta de billing que ya estaba abierta', () => {
  const opened = reduceActivation(newDocument(), billingCreated());
  const failed = reduceActivation(opened.doc, provisioningFailed());

  assert.equal(failed.doc.status, 'FAILED');
  assert.equal(failed.doc.failure?.step, 'provisioning');
  assert.equal(failed.doc.steps.billing.status, 'OK');
  assert.equal(failed.doc.steps.provisioning.status, 'FAILED');
  assert.equal(failed.doc.compensation.status, 'PENDING');
  assert.deepEqual(
    failed.outgoing.map((event) => event.eventType),
    [EVENT_TYPES.ActivationFailed],
  );

  const compensated = reduceActivation(failed.doc, billingCancelled());

  assert.equal(compensated.doc.compensation.status, 'DONE');
  assert.equal(
    compensated.doc.history.at(-1)?.eventType,
    EVENT_TYPES.BillingAccountCancelled,
  );
});

test('un evento tardío no revive una saga terminal', () => {
  const completed = reduceActivation(
    reduceActivation(newDocument(), billingCreated()).doc,
    provisioningCompleted(),
  ).doc;

  const lateFailure = reduceActivation(completed, billingFailed());

  assert.equal(lateFailure.doc.status, 'ACTIVE');
  assert.equal(lateFailure.doc.compensation.status, 'NOT_REQUIRED');
  assert.equal(lateFailure.outgoing.length, 0);
});

test('la vista pública no expone referencias internas de los pasos', () => {
  const { doc } = reduceActivation(newDocument(), billingCreated());
  const view = toActivationView(doc);

  assert.equal(view.steps.billing.status, 'OK');
  assert.equal(view.steps.billing.detail, 'Cuenta bil_123 creada');
  assert.equal(Object.hasOwn(view.steps.billing as object, 'reference'), false);
});
