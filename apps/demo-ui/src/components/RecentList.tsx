import type { ActivationView } from '@poc/contracts';
import { StatusBadge } from './StatusBadge';
import { PLAN_LABELS, relativeTime } from '../labels';

interface RecentListProps {
  items: ActivationView[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function RecentList({ items, selectedId, onSelect }: RecentListProps) {
  return (
    <section className="panel recent-panel">
      <div className="panel-heading compact">
        <div>
          <p className="eyebrow">Historial</p>
          <h2>Activaciones recientes</h2>
        </div>
        <span className="count-pill">{items.length}</span>
      </div>

      {items.length === 0 ? (
        <p className="empty-note">
          Todavía no hay activaciones. Creá la primera con el formulario.
        </p>
      ) : (
        <ul className="recent-list">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={`recent-item ${selectedId === item.id ? 'is-selected' : ''}`}
                onClick={() => onSelect(item.id)}
              >
                <span className="recent-top">
                  <strong>{item.customerId}</strong>
                  <StatusBadge status={item.status} subtle />
                </span>
                <span className="recent-meta">
                  <span className="mono">{PLAN_LABELS[item.planId] ?? item.planId}</span>
                  <span aria-hidden="true">·</span>
                  <span>{relativeTime(item.createdAt)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
