import type { ActivationStatus } from '@poc/contracts';
import { STATUS_LABELS, statusTone } from '../labels';

interface StatusBadgeProps {
  status: ActivationStatus;
  subtle?: boolean;
}

export function StatusBadge({ status, subtle = false }: StatusBadgeProps) {
  return (
    <span
      className={`status-badge ${statusTone(status)} ${subtle ? 'is-subtle' : ''}`}
    >
      <span className="status-dot" aria-hidden="true" />
      {STATUS_LABELS[status]}
    </span>
  );
}
