import { useState } from 'react';
import type { ActivationStepView, ActivationView } from '@poc/contracts';
import { StatusBadge } from './StatusBadge';
import { Timeline } from './Timeline';
import {
  FAILURE_LABELS,
  STATUS_LABELS,
  PLAN_LABELS,
  formatDateTime,
} from '../labels';

type VisualTone = 'ok' | 'bad' | 'pending' | 'running';

interface StepCardProps {
  index: string;
  title: string;
  caption: string;
  tone: VisualTone;
  detail: string;
}

function StepCard({ index, title, caption, tone, detail }: StepCardProps) {
  const mark = tone === 'ok' ? '✓' : tone === 'bad' ? '×' : '';
  return (
    <article className={`step-card step-${tone}`}>
      <div className="step-top">
        <span className="step-index">{index}</span>
        <span className={`step-mark ${tone === 'running' ? 'spinner' : ''}`}>
          {mark}
        </span>
      </div>
      <div>
        <h3>{title}</h3>
        <span className="step-caption">{caption}</span>
      </div>
      <p>{detail}</p>
    </article>
  );
}

function stepTone(
  step: ActivationStepView,
  overall: ActivationView['status'],
): VisualTone {
  if (step.status === 'OK') return 'ok';
  if (step.status === 'FAILED') return 'bad';
  if (overall === 'IN_PROGRESS') return 'running';
  return 'pending';
}

export function SagaDetail({ view }: { view: ActivationView }) {
  const [copied, setCopied] = useState(false);

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(view.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1_600);
    } catch {
      setCopied(false);
    }
  };

  const resultTone: VisualTone =
    view.status === 'ACTIVE'
      ? 'ok'
      : view.status === 'FAILED'
        ? 'bad'
        : 'pending';

  const resultDetail =
    view.status === 'ACTIVE'
      ? 'La activación quedó completada con ambos servicios confirmados.'
      : view.status === 'FAILED'
        ? 'La activación falló y se ejecutó la compensación.'
        : 'Esperando el resultado de billing y provisioning.';

  const statusHelper =
    view.status === 'PENDING'
      ? 'Evento publicado en Kafka. Esperando reacciones.'
      : view.status === 'IN_PROGRESS'
        ? 'Billing y provisioning procesan en paralelo.'
        : view.status === 'ACTIVE'
          ? 'Ambos servicios confirmaron la activación.'
          : 'Se aplicó la compensación de la saga.';

  return (
    <section className="panel detail-panel">
      <header className="detail-header">
        <div className="detail-title">
          <p className="eyebrow">Activación de Servicio</p>
          <h2>{PLAN_LABELS[view.planId] ?? view.planId}</h2>
          <div className="meta-line">
            <span className="mono">Cliente: {view.customerId}</span>
            <span aria-hidden="true">/</span>
            <span>{view.contactEmail}</span>
            <span aria-hidden="true">/</span>
            <span>{formatDateTime(view.createdAt)}</span>
          </div>
        </div>

        <div className={`detail-status ${view.status.toLowerCase()}`}>
          <StatusBadge status={view.status} />
          <p>{statusHelper}</p>
        </div>
      </header>

      <div className="id-strip">
        <span className="id-label">correlationId</span>
        <code>{view.id}</code>
        <button type="button" className="copy-button" onClick={copyId}>
          {copied ? 'Copiado' : 'Copiar'}
        </button>
        {view.simulateFailure !== 'none' ? (
          <span className="simulation-tag">
            {FAILURE_LABELS[view.simulateFailure]}
          </span>
        ) : null}
      </div>

      <div className="step-grid">
        <StepCard
          index="01"
          title="Solicitud"
          caption="activation-api"
          tone="ok"
          detail="ActivationRequested publicado en Kafka."
        />
        <StepCard
          index="02"
          title="Facturación"
          caption="billing-service"
          tone={stepTone(view.steps.billing, view.status)}
          detail={
            view.steps.billing.detail ??
            (view.status === 'IN_PROGRESS'
              ? 'Creando cuenta de facturación…'
              : 'Esperando respuesta.')
          }
        />
        <StepCard
          index="03"
          title="Aprovisionamiento"
          caption="provisioning-service"
          tone={stepTone(view.steps.provisioning, view.status)}
          detail={
            view.steps.provisioning.detail ??
            (view.status === 'IN_PROGRESS'
              ? 'Aprovisionando línea…'
              : 'Esperando respuesta.')
          }
        />
        <StepCard
          index="04"
          title="Resultado"
          caption="saga aggregator"
          tone={resultTone}
          detail={resultDetail}
        />
      </div>

      {view.failure ? (
        <div className="alert alert-bad">
          <span className="alert-icon" aria-hidden="true">
            !
          </span>
          <div>
            <strong>
              Falló {view.failure.step === 'billing' ? 'billing' : 'provisioning'}
            </strong>
            <p>{view.failure.reason}</p>
          </div>
        </div>
      ) : null}

      {view.status === 'FAILED' ? (
        <div
          className={`compensation-box compensation-${view.compensation.status.toLowerCase()}`}
        >
          <div>
            <span className="eyebrow">Compensación</span>
            <strong>
              {view.compensation.status === 'DONE'
                ? 'Cuenta de facturación anulada'
                : view.compensation.status === 'PENDING'
                  ? 'Anulando cuenta en billing…'
                  : 'No fue requerida'}
            </strong>
          </div>
          <p>
            {view.compensation.detail ??
              (view.compensation.status === 'PENDING'
                ? 'billing-service está procesando ActivationFailed para compensar.'
                : `${STATUS_LABELS[view.status]}.`)}
          </p>
        </div>
      ) : null}

      <Timeline history={view.history} />
    </section>
  );
}
