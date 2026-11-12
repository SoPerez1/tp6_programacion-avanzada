# Guion de la Demo

Guion reproducible para demostrar la POC en clase. Cada uno de los 5 escenarios demuestra un concepto fundamental de Apache Kafka y sistemas distribuidos.

> **Configuración sugerida de pantalla:**
> Pantalla dividida: **Demo UI** a la izquierda (`http://localhost:5173`), **Kafka UI** a la derecha (`http://localhost:8080`).

---

## 0. Preparación

Levantar todo el entorno local con Docker Compose:

```powershell
docker compose up -d --build
docker compose ps
```

Pestañas de apoyo para la demo:
- **Demo UI:** http://localhost:5173
- **Kafka UI:** http://localhost:8080
- **MailHog:** http://localhost:8025

Para verificar el entorno de punta a punta de forma automática:

```powershell
npm run smoke
```

---

## Escenario 1 · Camino feliz

**Concepto demostrado:** *Fan-out* (un único evento publicado dispara múltiples reacciones independientes en paralelo).

### Qué se hace:
Contratar un plan sin fallos desde la Demo UI:
- **Cliente:** `C-1001`
- **Plan:** `Plan Digital`
- **Fallo:** `Sin fallo`
- Clic en **Contratar plan**.

*(O por terminal: `node scripts/create-activation.mjs --customer C-1001 --plan PLAN_DIGITAL`)*

### Qué se ve:
1. `POST /activations` responde inmediatamente `202 Accepted` con estado `PENDING`.
2. La timeline de la UI recibe por WebSocket los eventos:
   - `ActivationRequested` (publicado por `activation-api`)
   - `BillingAccountCreated` (publicado por `billing-service`)
   - `ProvisioningCompleted` (publicado por `provisioning-service`)
   - `ActivationCompleted` (publicado por `activation-api` al agregar ambos OK)
3. La tarjeta pasa a estado **ACTIVE** en verde.
4. En **MailHog** aparece el correo de bienvenida: *"¡Tu PLAN_DIGITAL ya está activo!"*.
5. En **Kafka UI** se verifica que tanto `billing-svc` como `provisioning-svc` consumieron la misma partición con offsets independientes.

---

## Escenario 2 · Fallo y compensación

**Concepto demostrado:** *Saga por coreografía sin llamadas directas* y *Compensación distribuida*.

### Qué se hace:
Contratar un plan forzando un fallo en `provisioning`:
- **Cliente:** `C-2002`
- **Plan:** `Plan Hogar`
- **Simulación de fallo:** `Fallo en provisioning`
- Clic en **Contratar plan**.

*(O por terminal: `node scripts/create-activation.mjs --customer C-2002 --failure provisioning`)*

### Qué se ve:
1. `billing-service` crea la cuenta y publica `BillingAccountCreated`.
2. `provisioning-service` simula el fallo y publica `ProvisioningFailed`.
3. `activation-api` detecta el fallo, pasa la activación a **FAILED** y publica `ActivationFailed`.
4. `billing-service` escucha `ActivationFailed`, anula la cuenta previamente creada y publica `BillingAccountCancelled` (compensación).
5. En **MailHog** llega el correo de aviso de fallo: *"No pudimos activar tu PLAN_HOGAR"*.

---

## Escenario 3 · Servicio caído

**Concepto demostrado:** *Offset y durabilidad* (nadie pierde mensajes aunque un consumidor esté caído).

### Qué se hace:
1. Detener el servicio de notificaciones:
   ```powershell
   docker compose stop notification-service
   ```
2. Crear 3 activaciones exitosas consecutivas desde la UI o ejecutando:
   ```powershell
   node scripts/create-activation.mjs --customer C-3001
   node scripts/create-activation.mjs --customer C-3002
   node scripts/create-activation.mjs --customer C-3003
   ```
3. Observar en **Kafka UI** el consumer group `notification-svc`: muestra un **lag de 3** mensajes sin procesar.
4. Volver a levantar el servicio:
   ```powershell
   docker compose start notification-service
   ```

### Qué se ve:
Al reanudar, `notification-service` retoma desde su último offset confirmado, procesa los 3 mensajes pendientes y los 3 correos aparecen en MailHog. El lag vuelve a 0.

---

## Escenario 4 · Escalar horizontalmente

**Concepto demostrado:** *Consumer groups y particiones* (rebalanceo automático de particiones).

### Qué se hace:
1. Levantar una segunda instancia de `billing-service`:
   ```powershell
   docker compose up -d --scale billing-service=2
   ```
2. Ir a **Kafka UI** -> Consumer Groups -> `billing-svc`.

### Qué se ve:
Kafka UI muestra que las 3 particiones del topic `activation.requested` se redistribuyen dinámicamente entre las 2 instancias del consumer group (ej. una instancia toma 2 particiones y la otra toma 1), duplicando la capacidad de procesamiento sin duplicar eventos.

---

## Escenario 5 · Nuevo consumidor (Replay del log)

**Concepto demostrado:** *Replay del log histórico* sin afectar a los productores ni a los consumidores existentes.

### Qué se hace:
Levantar el servicio de fidelización (`loyalty-service`), que tiene un nuevo consumer group y configuración `auto.offset.reset=earliest`:
```powershell
docker compose --profile loyalty up -d loyalty-service
```

### Qué se ve:
1. `loyalty-service` arranca desde el offset 0 y lee todo el historial histórico de `activation.events`.
2. Asigna puntos de fidelización a todas las activaciones previas sin emitir llamadas hacia `activation-api` ni interferir con `billing` o `notification`.
3. Consultar los miembros acumulados:
   ```powershell
   curl http://localhost:3005/api/loyalty
   ```
