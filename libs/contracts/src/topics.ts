/**
 * Nombres de topics y constantes del contrato.
 * Un solo lugar de verdad para todos los servicios.
 */
export const TOPICS = {
  activationRequested: 'activation.requested',
  billingEvents: 'billing.events',
  provisioningEvents: 'provisioning.events',
  activationEvents: 'activation.events',
} as const;

export type BusinessTopic = (typeof TOPICS)[keyof typeof TOPICS];

export const BUSINESS_TOPICS: BusinessTopic[] = Object.values(TOPICS);

export const dlqTopic = (topic: string): string => `${topic}.dlq`;

export const ALL_TOPICS: string[] = [
  ...BUSINESS_TOPICS,
  ...BUSINESS_TOPICS.map(dlqTopic),
];

export const TOPIC_PARTITIONS = 3;
export const TOPIC_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export const EVENT_VERSION = 1;

export const EVENT_TYPES = {
  ActivationRequested: 'ActivationRequested',
  BillingAccountCreated: 'BillingAccountCreated',
  BillingFailed: 'BillingFailed',
  BillingAccountCancelled: 'BillingAccountCancelled',
  ProvisioningCompleted: 'ProvisioningCompleted',
  ProvisioningFailed: 'ProvisioningFailed',
  ActivationCompleted: 'ActivationCompleted',
  ActivationFailed: 'ActivationFailed',
} as const;

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];

export const SERVICES = {
  activationApi: 'activation-api',
  billing: 'billing-service',
  provisioning: 'provisioning-service',
  notification: 'notification-service',
  crmAnalytics: 'crm-analytics-service',
  loyalty: 'loyalty-service',
} as const;

export const ACTIVATION_STATUSES = [
  'PENDING',
  'IN_PROGRESS',
  'ACTIVE',
  'FAILED',
] as const;

export type ActivationStatus = (typeof ACTIVATION_STATUSES)[number];

export const STEP_STATUSES = ['PENDING', 'OK', 'FAILED'] as const;

export type StepStatus = (typeof STEP_STATUSES)[number];

export const PLANS = ['PLAN_DIGITAL', 'PLAN_HOGAR', 'PLAN_EMPRESA'] as const;

export type PlanId = (typeof PLANS)[number];

export const FAILURE_MODES = ['none', 'billing', 'provisioning'] as const;

export type FailureMode = (typeof FAILURE_MODES)[number];

/** Topic de negocio que corresponde a cada tipo de evento. */
export function topicForEvent(eventType: EventType): BusinessTopic {
  switch (eventType) {
    case EVENT_TYPES.ActivationRequested:
      return TOPICS.activationRequested;
    case EVENT_TYPES.BillingAccountCreated:
    case EVENT_TYPES.BillingFailed:
    case EVENT_TYPES.BillingAccountCancelled:
      return TOPICS.billingEvents;
    case EVENT_TYPES.ProvisioningCompleted:
    case EVENT_TYPES.ProvisioningFailed:
      return TOPICS.provisioningEvents;
    case EVENT_TYPES.ActivationCompleted:
    case EVENT_TYPES.ActivationFailed:
      return TOPICS.activationEvents;
  }
}
