import type {
  AnalyticsEventView,
  AnalyticsSummary,
  CreateActivationInput,
  CreateActivationResponse,
  ActivationListResponse,
  ActivationView,
} from '@poc/contracts';

export const API_URL = (
  import.meta.env.VITE_API_URL ?? 'http://localhost:3000'
).replace(/\/$/, '');

export const INSIGHTS_URL = (
  import.meta.env.VITE_INSIGHTS_URL ?? 'http://localhost:3004'
).replace(/\/$/, '');

export const EXTERNAL_LINKS = {
  kafkaUi: import.meta.env.VITE_KAFKA_UI_URL ?? 'http://localhost:8090',
  mailhog: import.meta.env.VITE_MAILHOG_URL ?? 'http://localhost:8025',
  health: `${API_URL}/health`,
  insightsHealth: `${INSIGHTS_URL}/health`,
};

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as {
      message?: string | { message?: string } | string[];
      error?: string;
    };
    if (Array.isArray(body.message)) return body.message.join(', ');
    if (typeof body.message === 'string') return body.message;
    if (body.message && typeof body.message === 'object') {
      return body.message.message ?? 'La API rechazó la solicitud';
    }
    return body.error ?? `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return (await response.json()) as T;
}

export const api = {
  list(limit = 25): Promise<ActivationListResponse> {
    return request<ActivationListResponse>(
      `${API_URL}/activations?limit=${limit}`,
    );
  },

  get(id: string): Promise<ActivationView> {
    return request<ActivationView>(
      `${API_URL}/activations/${encodeURIComponent(id)}`,
    );
  },

  create(input: CreateActivationInput): Promise<CreateActivationResponse> {
    return request<CreateActivationResponse>(
      `${API_URL}/activations`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    );
  },

  summary(): Promise<AnalyticsSummary> {
    return request<AnalyticsSummary>(`${INSIGHTS_URL}/api/analytics/summary`);
  },

  events(limit = 20): Promise<AnalyticsEventView[]> {
    return request<AnalyticsEventView[]>(
      `${INSIGHTS_URL}/api/analytics/events?limit=${limit}`,
    );
  },

  trace(correlationId: string): Promise<AnalyticsEventView[]> {
    return request<AnalyticsEventView[]>(
      `${INSIGHTS_URL}/api/analytics/trace/${encodeURIComponent(correlationId)}`,
    );
  },
};
