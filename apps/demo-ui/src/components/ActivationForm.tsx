import { useState, type FormEvent } from 'react';
import type {
  CreateActivationInput,
  FailureMode,
  PlanId,
} from '@poc/contracts';
import { FAILURE_LABELS } from '../labels';

interface ActivationFormProps {
  creating: boolean;
  error: string | null;
  onCreate: (input: CreateActivationInput) => Promise<void>;
}

const FAILURE_HELP: Record<FailureMode, string> = {
  none: 'Billing y provisioning confirman OK. La activación termina en estado ACTIVE.',
  billing:
    'Falla la creación de la cuenta en billing. La activación pasa a FAILED y se compensa.',
  provisioning:
    'Falla el aprovisionamiento de la línea. Billing anula la cuenta creada como compensación.',
};

const PLANS: Array<{ value: PlanId; label: string; hint: string }> = [
  { value: 'PLAN_DIGITAL', label: 'Plan Digital', hint: 'Fibra 300 Mbps + App' },
  { value: 'PLAN_HOGAR', label: 'Plan Hogar', hint: 'Fibra 500 Mbps + TV' },
  { value: 'PLAN_EMPRESA', label: 'Plan Empresa', hint: 'Fibra 1000 Mbps + IP Fija' },
];

export function ActivationForm({
  creating,
  error,
  onCreate,
}: ActivationFormProps) {
  const [customerId, setCustomerId] = useState(
    () => `C-${Math.floor(1000 + Math.random() * 9000)}`,
  );
  const [contactEmail, setContactEmail] = useState('cliente@demo.test');
  const [planId, setPlanId] = useState<PlanId>('PLAN_DIGITAL');
  const [failure, setFailure] = useState<FailureMode>('none');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await onCreate({
      customerId: customerId.trim(),
      contactEmail: contactEmail.trim(),
      planId,
      simulateFailure: failure,
    });
  };

  return (
    <section className="panel form-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Nueva solicitud</p>
          <h2>Contratar plan</h2>
        </div>
        <span className="panel-index">01</span>
      </div>

      <form onSubmit={submit} className="stack">
        <div className="field-row">
          <label className="field">
            <span>ID de Cliente</span>
            <input
              value={customerId}
              onChange={(event) => setCustomerId(event.target.value)}
              pattern="[-A-Za-z0-9_]{2,40}"
              title="Letras, números, guion y guion bajo"
              required
            />
          </label>
          <button
            type="button"
            className="ghost-button generate"
            onClick={() =>
              setCustomerId(`C-${Math.floor(1000 + Math.random() * 9000)}`)
            }
          >
            Nuevo ID
          </button>
        </div>

        <label className="field">
          <span>Email de contacto</span>
          <input
            type="email"
            value={contactEmail}
            onChange={(event) => setContactEmail(event.target.value)}
            placeholder="cliente@demo.test"
            required
          />
        </label>

        <fieldset className="field">
          <legend>Plan de servicio</legend>
          <div className="pill-grid">
            {PLANS.map((item) => (
              <label
                key={item.value}
                className={`choice-card ${planId === item.value ? 'is-active' : ''}`}
              >
                <input
                  type="radio"
                  name="planId"
                  value={item.value}
                  checked={planId === item.value}
                  onChange={() => setPlanId(item.value)}
                />
                <span className="choice-title">{item.label}</span>
                <span className="choice-hint">{item.hint}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="field">
          <legend>Simulación de fallo (para demo)</legend>
          <div className="pill-grid failure-grid">
            {(['none', 'billing', 'provisioning'] as const).map((mode) => (
              <label
                key={mode}
                className={`choice-card choice-${mode} ${failure === mode ? 'is-active' : ''}`}
              >
                <input
                  type="radio"
                  name="failureMode"
                  value={mode}
                  checked={failure === mode}
                  onChange={() => setFailure(mode)}
                />
                <span className="choice-title">{FAILURE_LABELS[mode]}</span>
              </label>
            ))}
          </div>
          <p className="field-help">{FAILURE_HELP[failure]}</p>
        </fieldset>

        {error ? (
          <div className="alert alert-bad" role="alert">
            <span className="alert-icon" aria-hidden="true">
              !
            </span>
            <div>
              <strong>No se pudo enviar la solicitud</strong>
              <p>{error}</p>
            </div>
          </div>
        ) : null}

        <button
          type="submit"
          className="submit-button"
          disabled={creating}
        >
          {creating ? 'Publicando en Kafka…' : 'Contratar plan'}
        </button>
      </form>
    </section>
  );
}
