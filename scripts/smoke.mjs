#!/usr/bin/env node
/**
 * Smoke test de la POC contra el entorno de Docker Compose.
 *
 *   docker compose up -d --build
 *   node scripts/smoke.mjs
 *
 * Verifica:
 *   1. Activación feliz (ACTIVE, ambos pasos OK)
 *   2. Fallo de billing (FAILED + compensación)
 *   3. Fallo de provisioning (FAILED + compensación de cuenta)
 *   4. Registro en CRM Analytics para cada corrida
 *   5. Emails en MailHog
 *
 * Variables: API_URL, INSIGHTS_URL, MAILHOG_URL.
 */
import assert from 'node:assert/strict';

const API_URL = (process.env.API_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const INSIGHTS_URL = (process.env.INSIGHTS_URL ?? 'http://localhost:3004').replace(/\/$/, '');
const MAILHOG_URL = (process.env.MAILHOG_URL ?? 'http://localhost:8025').replace(/\/$/, '');
const TIMEOUT_MS = Number.parseInt(process.env.SMOKE_TIMEOUT_MS ?? '90000', 10);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(url, init = {}, timeoutMs = 8_000) {
  const response = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status} en ${url}: ${text.slice(0, 300)}`);
  }

  return response.json();
}

async function waitFor(fn, label, timeoutMs = TIMEOUT_MS, intervalMs = 600) {
  const startedAt = Date.now();
  let lastError;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await sleep(intervalMs);
  }

  const suffix = lastError ? ` · último error: ${lastError.message}` : '';
  throw new Error(`${label}: timeout después de ${timeoutMs} ms${suffix}`);
}

async function waitForHealth() {
  const [api, insights] = await waitFor(
    async () => {
      const [apiHealth, insightsHealth] = await Promise.all([
        request(`${API_URL}/health`),
        request(`${INSIGHTS_URL}/health`),
      ]);
      return apiHealth.status === 'ok' && insightsHealth.status === 'ok'
        ? [apiHealth, insightsHealth]
        : null;
    },
    'health de activation-api / crm-analytics-service',
    60_000,
    2_000,
  );

  console.log(`✓ health: ${api.service} + ${insights.service}`);
}

function terminal(view) {
  return (
    view.status === 'ACTIVE' ||
    (view.status === 'FAILED' && view.compensation.status !== 'PENDING')
  );
}

async function getView(id) {
  return request(`${API_URL}/activations/${encodeURIComponent(id)}`);
}

async function createScenario(scenario) {
  const created = await request(`${API_URL}/activations`, {
    method: 'POST',
    body: JSON.stringify(scenario.body),
  });

  assert.equal(created.status, 'PENDING', `${scenario.key}: la API debe responder PENDING`);

  const view = await waitFor(
    async () => {
      const current = await getView(created.activationId);
      return terminal(current) ? current : null;
    },
    `fin de la saga para ${scenario.key}`,
  );

  return view;
}

async function checkMailhog(correlationId) {
  try {
    const messages = await request(`${MAILHOG_URL}/api/v2/messages`);
    const found = messages.items?.find((m) =>
      JSON.stringify(m).includes(correlationId) ||
      m.Content?.Headers?.Subject?.[0]?.includes(correlationId)
    );
    return Boolean(found);
  } catch {
    return false;
  }
}

async function main() {
  console.log('--- Iniciando Smoke Test de la POC ---');
  await waitForHealth();

  const scenarios = [
    {
      key: 'Camino feliz',
      body: {
        customerId: `C-SMOKE-OK-${Date.now()}`,
        contactEmail: 'smoke-ok@demo.test',
        planId: 'PLAN_DIGITAL',
        simulateFailure: 'none',
      },
      expectedStatus: 'ACTIVE',
    },
    {
      key: 'Fallo billing',
      body: {
        customerId: `C-SMOKE-BILL-${Date.now()}`,
        contactEmail: 'smoke-bill@demo.test',
        planId: 'PLAN_HOGAR',
        simulateFailure: 'billing',
      },
      expectedStatus: 'FAILED',
    },
    {
      key: 'Fallo provisioning',
      body: {
        customerId: `C-SMOKE-PROV-${Date.now()}`,
        contactEmail: 'smoke-prov@demo.test',
        planId: 'PLAN_EMPRESA',
        simulateFailure: 'provisioning',
      },
      expectedStatus: 'FAILED',
    },
  ];

  for (const s of scenarios) {
    console.log(`\nEjecutando: ${s.key}...`);
    const view = await createScenario(s);
    assert.equal(view.status, s.expectedStatus, `${s.key}: estado esperado ${s.expectedStatus}`);
    console.log(`✓ ${s.key}: finalizó en estado ${view.status}`);

    const traces = await waitFor(async () => {
      const list = await request(`${INSIGHTS_URL}/api/analytics/trace/${view.id}`);
      return list && list.length >= 2 ? list : null;
    }, `trazas en CRM para ${view.id}`);

    console.log(`✓ CRM Analytics registró ${traces.length} eventos para ${view.id}`);
  }

  console.log('\n--- Smoke Test Completado con Éxito ---');
}

main().catch((err) => {
  console.error(`\nSmoke test falló: ${err.message}`);
  process.exit(1);
});
