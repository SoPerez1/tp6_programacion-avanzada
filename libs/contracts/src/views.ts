import type {
  ActivationStatus,
  EventType,
  FailureMode,
  PlanId,
  StepStatus,
} from './topics';

export interface CreateActivationInput {
  customerId?: string;
  contactEmail: string;
  planId: PlanId;
  simulateFailure: FailureMode;
}

export interface CreateActivationResponse {
  activationId: string;
  customerId: string;
  status: ActivationStatus;
  correlationId: string;
}

export interface ActivationStepView {
  status: StepStatus;
  at?: string;
  detail?: string;
}

export interface CompensationView {
  status: 'NOT_REQUIRED' | 'PENDING' | 'DONE';
  at?: string;
  detail?: string;
}

export interface TimelineEntry {
  eventType: EventType;
  at: string;
  source: string;
  detail?: string;
}

export interface ActivationView {
  id: string;
  customerId: string;
  contactEmail: string;
  planId: PlanId;
  simulateFailure: FailureMode;
  status: ActivationStatus;
  steps: {
    billing: ActivationStepView;
    provisioning: ActivationStepView;
  };
  compensation: CompensationView;
  failure?: {
    step: 'billing' | 'provisioning';
    reason: string;
    at: string;
  };
  history: TimelineEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface ActivationListResponse {
  items: ActivationView[];
}

export interface AnalyticsEventView {
  eventId: string;
  eventType: EventType;
  correlationId: string;
  customerId: string;
  source: string;
  topic: string;
  partition: number;
  offset: string;
  occurredAt: string;
  receivedAt: string;
  payload: unknown;
}

export interface AnalyticsSummary {
  totalEvents: number;
  totalActivations: number;
  byType: Array<{ eventType: string; count: number }>;
  lastEventAt?: string;
}
