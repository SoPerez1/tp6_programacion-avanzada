import { useEffect, useRef } from 'react';
import type { TimelineEntry } from '@poc/contracts';
import { EVENT_LABELS, eventTone, formatClock, formatDateTime } from '../labels';

interface TimelineProps {
  history: TimelineEntry[];
}

export function Timeline({ history }: TimelineProps) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [history.length]);

  return (
    <div className="timeline-block">
      <div className="timeline-heading">
        <h3>Timeline de la saga</h3>
        <span className="count-pill">{history.length} eventos</span>
      </div>

      <div className="timeline-scroll" ref={listRef}>
        <ol className="timeline">
          {history.map((entry, index) => (
            <li
              key={`${entry.eventType}-${entry.at}-${index}`}
              className={`timeline-item tone-${eventTone(entry.eventType)}`}
            >
              <span className="timeline-marker" aria-hidden="true" />
              <div className="timeline-card">
                <div className="timeline-top">
                  <strong>{EVENT_LABELS[entry.eventType]}</strong>
                  <time
                    dateTime={entry.at}
                    title={formatDateTime(entry.at)}
                    className="mono"
                  >
                    {formatClock(entry.at)}
                  </time>
                </div>
                {entry.detail ? (
                  <p className="timeline-detail">{entry.detail}</p>
                ) : null}
                <span className="timeline-source">
                  {entry.source} · {entry.eventType}
                </span>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
