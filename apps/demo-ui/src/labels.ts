import type {
  ActivationStatus,
  EventType,
  FailureMode,
  PlanId,
  StepStatus,
} from '@poc/contracts';

export const EVENT_LABELS: Record<EventType, string> = {
  ActivationRequested: 'Activación solicitada',
  BillingAccountCreated: 'Cuenta de facturación creada',
  BillingFailed: 'Falló facturación',
  BillingAccountCancelled: 'Facturación anulada (compensación)',
  ProvisioningCompleted: 'Línea aprovisionada',
  ProvisioningFailed: 'Falló aprovisionamiento',
  ActivationCompleted: 'Activación completada',
  ActivationFailed: 'Activación fallida',
};

export const STATUS_LABELS: Record<ActivationStatus, string> = {
  PENDING: 'Pendiente',
  IN_PROGRESS: 'En curso',
  ACTIVE: 'Activa',
  FAILED: 'Fallida',
};

export const STEP_LABELS: Record<StepStatus, string> = {
  PENDING: 'Pendiente',
  OK: 'Confirmado',
  FAILED: 'Falló',
};

export const FAILURE_LABELS: Record<FailureMode, string> = {
  none: 'Sin fallo',
  billing: 'Fallo en billing',
  provisioning: 'Fallo en provisioning',
};

export const PLAN_LABELS: Record<PlanId, string> = {
  PLAN_DIGITAL: 'Plan Digital',
  PLAN_HOGAR: 'Plan Hogar',
  PLAN_EMPRESA: 'Plan Empresa',
};

export function statusTone(status: ActivationStatus): string {
  return `tone-${status.toLowerCase()}`;
}

export function eventTone(eventType: EventType): string {
  if (eventType === 'ActivationCompleted') return 'ok';
  if (
    eventType === 'ActivationFailed' ||
    eventType === 'BillingFailed' ||
    eventType === 'ProvisioningFailed'
  ) {
    return 'bad';
  }
  if (eventType === 'BillingAccountCancelled') return 'warn';
  return 'neutral';
}

export function formatClock(iso: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(iso));
}

export function relativeTime(iso: string): string {
  const diffSeconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (Math.abs(diffSeconds) < 10) return 'ahora';
  if (diffSeconds < 60) return `hace ${diffSeconds}s`;
  const minutes = Math.floor(diffSeconds / 60);
  if (minutes < 60) return `hace ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours}h`;
  return `hace ${Math.floor(hours / 24)}d`;
}
