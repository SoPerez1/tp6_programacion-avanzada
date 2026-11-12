import type {
  AnalyticsEventView,
  AnalyticsSummary,
  EventType,
} from '@poc/contracts';
import { EVENT_LABELS, eventTone, formatClock } from '../labels';

interface InsightsPanelProps {
  summary: AnalyticsSummary | null;
  events: AnalyticsEventView[];
  online: boolean;
}

export function InsightsPanel({
  summary,
  events,
  online,
}: InsightsPanelProps) {
  const byType = summary?.byType.slice(0, 5) ?? [];
  const maxCount = Math.max(1, ...byType.map((item) => item.count));

  return (
    <aside className="panel insights-panel">
      <div className="panel-heading compact">
        <div>
          <p className="eyebrow">Event bus</p>
          <h2>Observabilidad (CRM)</h2>
        </div>
        <span className={`live-dot ${online ? 'is-on' : ''}`} />
      </div>

      <div className="kpi-row">
        <div className="kpi">
          <strong>{summary?.totalEvents ?? '—'}</strong>
          <span>eventos</span>
        </div>
        <div className="kpi">
          <strong>{summary?.totalActivations ?? '—'}</strong>
          <span>activaciones</span>
        </div>
      </div>

      {byType.length > 0 ? (
        <div className="bar-block">
          <p className="mini-title">Eventos por tipo</p>
          <ul className="bar-list">
            {byType.map((item) => (
              <li key={item.eventType}>
                <span className="bar-label">
                  {EVENT_LABELS[item.eventType as EventType] ?? item.eventType}
                </span>
                <div className="bar-track">
                  <div
                    className="bar-fill"
                    style={{
                      width: `${Math.round((item.count / maxCount) * 100)}%`,
                    }}
                  />
                </div>
                <span className="bar-value">{item.count}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="stream-block">
        <p className="mini-title">Últimos eventos recibidos</p>
        {events.length === 0 ? (
          <p className="empty-note">Esperando eventos en Kafka…</p>
        ) : (
          <ul className="stream-list">
            {events.slice(0, 7).map((event) => (
              <li
                key={`${event.eventId}-${event.offset}`}
                className={`stream-item tone-${eventTone(event.eventType)}`}
              >
                <div className="stream-top">
                  <strong>
                    {EVENT_LABELS[event.eventType] ?? event.eventType}
                  </strong>
                  <time className="mono">{formatClock(event.occurredAt)}</time>
                </div>
                <span className="stream-meta">
                  <span className="mono">{event.customerId}</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    p{event.partition} / offset {event.offset}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
