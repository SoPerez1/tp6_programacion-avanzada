import { useEffect, useState } from 'react';
import type {
  AnalyticsEventView,
  AnalyticsSummary,
  CreateActivationInput,
  ActivationView,
} from '@poc/contracts';
import { api, EXTERNAL_LINKS } from './api';
import { connectActivationSocket } from './socket';
import { ActivationForm } from './components/ActivationForm';
import { RecentList } from './components/RecentList';
import { SagaDetail } from './components/SagaDetail';
import { InsightsPanel } from './components/InsightsPanel';

function EmptyState({ loading }: { loading: boolean }) {
  return (
    <section className="panel empty-state">
      <div className="empty-graphic" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <p className="eyebrow">POC Activación de Servicios</p>
      <h2>{loading ? 'Cargando activaciones…' : 'Seleccioná una activación'}</h2>
      <p>
        Contratá un plan desde el formulario o elegí una activación del historial
        para ver la timeline, el estado de la saga y la compensación.
      </p>
    </section>
  );
}

export function App() {
  const [items, setItems] = useState<ActivationView[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<ActivationView | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiOnline, setApiOnline] = useState(false);
  const [socketOnline, setSocketOnline] = useState(false);
  const [insightsOnline, setInsightsOnline] = useState(false);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [events, setEvents] = useState<AnalyticsEventView[]>([]);

  useEffect(() => {
    let active = true;

    const loadList = async () => {
      try {
        const data = await api.list(25);
        if (!active) return;

        setItems(data.items);
        setApiOnline(true);
        setSelectedId((current) => current ?? data.items[0]?.id ?? null);
        setSelected((current) => {
          if (!current) return data.items[0] ?? null;
          return data.items.find((item) => item.id === current.id) ?? current;
        });
      } catch {
        if (active) setApiOnline(false);
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadList();
    const timer = window.setInterval(loadList, 8_000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    let active = true;

    const loadDetail = async () => {
      try {
        const view = await api.get(selectedId);
        if (!active) return;
        setSelected(view);
        setApiOnline(true);
        setItems((current) =>
          current.map((item) => (item.id === view.id ? view : item)),
        );
      } catch {
        if (active) setApiOnline(false);
      }
    };

    void loadDetail();
    const timer = window.setInterval(loadDetail, 5_000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [selectedId]);

  useEffect(() => {
    const socket = connectActivationSocket({
      onStatus: (connected) => setSocketOnline(connected),
      onUpdate: (view) => {
        setItems((current) => {
          const index = current.findIndex((item) => item.id === view.id);
          if (index === -1) return [view, ...current];
          const next = [...current];
          next[index] = view;
          return next;
        });

        setSelected((current) => (current?.id === view.id ? view : current));
      },
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    let active = true;

    const loadAnalytics = async () => {
      try {
        const [sum, rec] = await Promise.all([api.summary(), api.events(20)]);
        if (!active) return;
        setSummary(sum);
        setEvents(rec);
        setInsightsOnline(true);
      } catch {
        if (active) setInsightsOnline(false);
      }
    };

    void loadAnalytics();
    const timer = window.setInterval(loadAnalytics, 4_000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const handleCreate = async (input: CreateActivationInput) => {
    setCreating(true);
    setCreateError(null);
    try {
      const response = await api.create(input);
      setSelectedId(response.activationId);
    } catch (error) {
      setCreateError(
        error instanceof Error ? error.message : 'Error al crear la activación',
      );
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">POC</span>
          <div className="brand-text">
            <strong>Activación de Servicios con Kafka</strong>
            <span>Sistemas Distribuidos · FCyT UADER</span>
          </div>
        </div>

        <div className="topbar-links">
          <span className={`api-state ${apiOnline ? 'is-on' : ''}`}>
            <span aria-hidden="true" />
            API REST
          </span>
          <span className={`connection-pill ${socketOnline ? 'is-on' : ''}`}>
            <span className="connection-dot" aria-hidden="true" />
            WebSocket
          </span>
          <span className={`connection-pill ${insightsOnline ? 'is-on' : ''}`}>
            <span className="connection-dot" aria-hidden="true" />
            CRM / Kafka
          </span>
          <a
            href={EXTERNAL_LINKS.kafkaUi}
            target="_blank"
            rel="noreferrer"
          >
            Kafka UI <span>↗</span>
          </a>
          <a
            href={EXTERNAL_LINKS.mailhog}
            target="_blank"
            rel="noreferrer"
          >
            MailHog <span>↗</span>
          </a>
        </div>
      </header>

      <main className="layout">
        <div className="column">
          <ActivationForm
            creating={creating}
            error={createError}
            onCreate={handleCreate}
          />
          <RecentList
            items={items}
            selectedId={selectedId}
            onSelect={(id) => setSelectedId(id)}
          />
        </div>

        <div className="column">
          {selected ? (
            <SagaDetail view={selected} />
          ) : (
            <EmptyState loading={loading} />
          )}
        </div>

        <div className="column">
          <InsightsPanel
            summary={summary}
            events={events}
            online={insightsOnline}
          />
        </div>
      </main>
    </div>
  );
}
