#!/usr/bin/env node
/**
 * Crea una activación de servicio y sigue la saga hasta que termina.
 *
 * Uso:
 *   node scripts/create-activation.mjs
 *   node scripts/create-activation.mjs --failure billing
 *   node scripts/create-activation.mjs --failure provisioning --plan PLAN_EMPRESA
 *   node scripts/create-activation.mjs --customer C-2001 --email cliente@demo.test
 *
 * Variables:
 *   API_URL   por defecto http://localhost:3000
 */
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    customer: { type: 'string', short: 'c' },
    email: { type: 'string', short: 'e' },
    plan: { type: 'string', short: 'p', default: 'PLAN_DIGITAL' },
    failure: { type: 'string', short: 'f', default: 'none' },
    api: { type: 'string' },
    timeout: { type: 'string', default: '60000' },
    help: { type: 'boolean', short: 'h' },
  },
  allowPositionals: false,
});

if (values.help) {
  console.log(`Uso: node scripts/create-activation.mjs [opciones]

  -c, --customer   ID de cliente (default: aleatorio C-xxxx)
  -e, --email      Email de contacto (default: cliente@demo.test)
  -p, --plan       PLAN_DIGITAL | PLAN_HOGAR | PLAN_EMPRESA (default: PLAN_DIGITAL)
  -f, --failure    none | billing | provisioning (default: none)
      --api        URL de activation-api (default: $API_URL o http://localhost:3000)
      --timeout    ms máximos de espera (default: 60000)
  -h, --help       Muestra esta ayuda
`);
  process.exit(0);
}

const API_URL = (values.api ?? process.env.API_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const timeoutMs = Number.parseInt(values.timeout, 10);
const plans = new Set(['PLAN_DIGITAL', 'PLAN_HOGAR', 'PLAN_EMPRESA']);
const failures = new Set(['none', 'billing', 'provisioning']);

if (!plans.has(values.plan)) {
  console.error(`Plan inválido: ${values.plan}. Usá PLAN_DIGITAL, PLAN_HOGAR o PLAN_EMPRESA.`);
  process.exit(2);
}
if (!failures.has(values.failure)) {
  console.error(`Fallo inválido: ${values.failure}. Usá none, billing o provisioning.`);
  process.exit(2);
}
if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
  console.error('--timeout debe ser un número positivo de milisegundos.');
  process.exit(2);
}

const suffix = Math.floor(1000 + Math.random() * 9000);
const body = {
  customerId: values.customer ?? `C-${suffix}`,
  contactEmail: values.email ?? 'cliente@demo.test',
  planId: values.plan,
  simulateFailure: values.failure,
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(path, init) {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status} en ${path}: ${text}`);
  }

  return response.json();
}

function label(status) {
  return (
    {
      PENDING: 'Pendiente',
      IN_PROGRESS: 'En curso',
      ACTIVE: 'Activa',
      FAILED: 'Fallida',
    }[status] ?? status
  );
}

function printTimeline(view) {
  console.log('\nTimeline');
  for (const entry of view.history) {
    const time = new Date(entry.at).toLocaleTimeString('es-AR');
    const detail = entry.detail ? ` (${entry.detail})` : '';
    console.log(`  ${time}  ${entry.eventType.padEnd(28)}  ${entry.source}${detail}`);
  }
}

async function main() {
  console.log(`Conectando a ${API_URL}...`);
  console.log(`Enviando POST /activations con:`, JSON.stringify(body, null, 2));

  const created = await request('/activations', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  console.log(`\n✓ Solicitud aceptada: ${created.activationId} (HTTP 202 Accepted)`);
  console.log(`  Estado inicial: ${label(created.status)}`);
  console.log(`  Cliente: ${created.customerId}`);

  const start = Date.now();
  let lastStatus = created.status;

  while (Date.now() - start < timeoutMs) {
    await sleep(600);
    const view = await request(`/activations/${encodeURIComponent(created.activationId)}`);

    if (view.status !== lastStatus) {
      console.log(`  → ${label(view.status)} (${((Date.now() - start) / 1000).toFixed(1)}s)`);
      lastStatus = view.status;
    }

    if (view.status === 'ACTIVE' || (view.status === 'FAILED' && view.compensation.status !== 'PENDING')) {
      printTimeline(view);
      console.log(`\nResultado: ${label(view.status)} en ${((Date.now() - start) / 1000).toFixed(1)}s`);

      if (view.status === 'ACTIVE') {
        console.log('✓ La activación finalizó exitosamente (billing y provisioning OK).');
      } else {
        console.log(`✗ Falló en ${view.failure?.step ?? 'paso desconocido'}: ${view.failure?.reason ?? 'sin motivo'}`);
        console.log(`  Compensación: ${view.compensation.status}`);
      }
      return;
    }
  }

  throw new Error(`Timeout esperando el fin de la saga después de ${timeoutMs} ms`);
}

main().catch((err) => {
  console.error(`\nError: ${err.message}`);
  process.exit(1);
});

