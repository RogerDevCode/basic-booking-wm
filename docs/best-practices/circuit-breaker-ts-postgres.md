# Circuit Breaker Pattern en TypeScript con PostgreSQL - Best Practices

## Estados del Circuit Breaker

### Máquina de Estados

```
┌─────────────┐
│   CLOSED    │ ← Estado normal, todas las requests pasan
│  (Cerrado)  │
└──────┬──────┘
       │
       │ Fallos > threshold
       ▼
┌─────────────┐
│    OPEN     │ ← Todas las requests fallan inmediatamente
│   (Abierto) │
└──────┬──────┘
       │
       │ Timeout expirado
       ▼
┌─────────────┐
│  HALF-OPEN  │ ← Testing, algunas requests pasan
│ (Semi-abierto)
└──────┬──────┘
       │
       │ Success → CLOSED
       │ Failure → OPEN
```

### Descripción de Estados

| Estado | Comportamiento | Cuándo Transiciona |
|--------|----------------|-------------------|
| **CLOSED** | Requests pasan normalmente, se monitorean fallos | → OPEN cuando fallos > threshold |
| **OPEN** | Requests fallan inmediatamente sin llamar al servicio | → HALF-OPEN cuando timeout expira |
| **HALF-OPEN** | Pocas requests de prueba para verificar recuperación | → CLOSED si éxito, → OPEN si fallo |

## Implementación en TypeScript

### Tipos y Configuración Base

```typescript
type CBState = "closed" | "open" | "half-open";

interface CBCounts {
  requests: number;
  totalSuccesses: number;
  totalFailures: number;
  consecutiveSuccesses: number;
  consecutiveFailures: number;
}

interface CBSettings {
  name: string;
  maxRequests: number;
  timeoutMs: number;
  readyToTrip: (counts: CBCounts) => boolean;
  onStateChange?: (name: string, from: CBState, to: CBState, counts: CBCounts) => void;
  isSuccessful?: (err: Error | null) => boolean;
}

type Result<T> = [Error | null, T | null];

class CircuitBreaker {
  private state: CBState = "closed";
  private counts: CBCounts = {
    requests: 0,
    totalSuccesses: 0,
    totalFailures: 0,
    consecutiveSuccesses: 0,
    consecutiveFailures: 0,
  };
  private timeoutAt: number | null = null;
  private halfOpenCalls = 0;

  constructor(private settings: CBSettings) {}

  getState(): CBState {
    if (this.state === "open" && this.timeoutAt !== null && Date.now() >= this.timeoutAt) {
      this.transitionTo("half-open");
    }
    return this.state;
  }

  getCounts(): Readonly<CBCounts> {
    return { ...this.counts };
  }

  async execute<T>(fn: () => Promise<T>): Promise<Result<T>> {
    const currentState = this.getState();

    if (currentState === "open") {
      return [new Error(`Circuit breaker '${this.settings.name}' is open`), null];
    }

    if (currentState === "half-open" && this.halfOpenCalls >= this.settings.maxRequests) {
      return [new Error(`Circuit breaker '${this.settings.name}' half-open limit reached`), null];
    }

    if (currentState === "half-open") {
      this.halfOpenCalls++;
    }

    this.counts.requests++;

    try {
      const result = await fn();
      this.onSuccess();
      return [null, result];
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      if (this.isErrorSuccessful(error)) {
        this.onSuccess();
        return [null, null as unknown as T];
      }
      this.onFailure();
      return [error, null];
    }
  }

  private onSuccess(): void {
    this.counts.totalSuccesses++;
    this.counts.consecutiveSuccesses++;
    this.counts.consecutiveFailures = 0;

    if (this.state === "half-open") {
      this.transitionTo("closed");
      this.halfOpenCalls = 0;
    }
  }

  private onFailure(): void {
    this.counts.totalFailures++;
    this.counts.consecutiveFailures++;
    this.counts.consecutiveSuccesses = 0;

    if (this.settings.readyToTrip(this.counts)) {
      this.transitionTo("open");
      this.halfOpenCalls = 0;
    }
  }

  private isErrorSuccessful(err: Error): boolean {
    if (this.settings.isSuccessful !== undefined) {
      return this.settings.isSuccessful(err);
    }
    return false;
  }

  private transitionTo(newState: CBState): void {
    const oldState = this.state;
    if (oldState === newState) return;

    this.state = newState;

    if (newState === "open") {
      this.timeoutAt = Date.now() + this.settings.timeoutMs;
    }

    this.settings.onStateChange?.(this.settings.name, oldState, newState, { ...this.counts });
  }
}
```

### Crear Circuit Breaker

```typescript
function createCircuitBreaker(serviceName: string): CircuitBreaker {
  return new CircuitBreaker({
    name: serviceName,
    maxRequests: 3,
    timeoutMs: 60_000,
    readyToTrip: (counts) => counts.consecutiveFailures >= 5,
    onStateChange: (name, from, to) => {
      console.log(`[${name}] State changed from ${from} to ${to}`);
    },
    isSuccessful: (err) => {
      if (err === null) return true;
      if (isClientError(err)) return true;
      return false;
    },
  });
}

function isClientError(err: Error): boolean {
  if ("status" in err && typeof err.status === "number") {
    return err.status >= 400 && err.status < 500;
  }
  if ("code" in err && typeof err.code === "string") {
    const code = parseInt(err.code, 10);
    return code >= 400 && code < 500;
  }
  return false;
}
```

### Uso en script Windmill

```typescript
import type { CircuitBreaker } from "../internal/circuit-breaker";

export async function main(
  cb: CircuitBreaker,
  serviceId: string,
): Promise<Result<Readonly<Record<string, unknown>>>> {
  const [err, result] = await cb.execute(async () => {
    return callExternalService(serviceId);
  });

  if (err != null) {
    return [err, null];
  }

  return [null, result];
}
```

### Configuraciones Recomendadas por Servicio

```typescript
// Google Calendar API (externo, puede ser lento)
const gcalBreaker = new CircuitBreaker({
  name: "gcal",
  maxRequests: 3,
  timeoutMs: 60_000,
  readyToTrip: (counts) => counts.consecutiveFailures >= 5,
});

// Telegram API (más rápido, más tolerante)
const telegramBreaker = new CircuitBreaker({
  name: "telegram",
  maxRequests: 5,
  timeoutMs: 30_000,
  readyToTrip: (counts) => counts.consecutiveFailures >= 10,
});

// Base de datos local (muy tolerante)
const dbBreaker = new CircuitBreaker({
  name: "postgres",
  maxRequests: 1,
  timeoutMs: 10_000,
  readyToTrip: (counts) => counts.consecutiveFailures >= 3,
});
```

## Persistencia en PostgreSQL

### Schema de Tabla

```sql
-- Tabla para estado de circuit breakers
CREATE TABLE circuit_breaker_state (
    service_id VARCHAR(50) PRIMARY KEY,
    state VARCHAR(20) NOT NULL DEFAULT 'closed',
    failure_count INT NOT NULL DEFAULT 0,
    consecutive_failures INT NOT NULL DEFAULT 0,
    consecutive_successes INT NOT NULL DEFAULT 0,
    total_requests BIGINT NOT NULL DEFAULT 0,
    total_successes BIGINT NOT NULL DEFAULT 0,
    total_failures BIGINT NOT NULL DEFAULT 0,
    last_failure_at TIMESTAMPTZ,
    last_success_at TIMESTAMPTZ,
    timeout_at TIMESTAMPTZ,
    opened_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cb_state ON circuit_breaker_state(state);
CREATE INDEX idx_cb_timeout ON circuit_breaker_state(timeout_at)
    WHERE state = 'open';

CREATE OR REPLACE FUNCTION update_cb_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_cb_updated_at
    BEFORE UPDATE ON circuit_breaker_state
    FOR EACH ROW
    EXECUTE FUNCTION update_cb_updated_at();
```

### Funciones de Persistencia

```typescript
import { Pool } from "pg";

interface CBPersistedState {
  serviceId: string;
  state: CBState;
  failureCount: number;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  totalRequests: bigint;
  totalSuccesses: bigint;
  totalFailures: bigint;
  lastFailureAt: Date | null;
  lastSuccessAt: Date | null;
  timeoutAt: Date | null;
  openedAt: Date | null;
}

async function saveCircuitBreakerState(
  pool: Pool,
  state: CBPersistedState,
): Promise<Result<null>> {
  const query = `
    INSERT INTO circuit_breaker_state (
      service_id, state, failure_count, consecutive_failures,
      consecutive_successes, total_requests, total_successes,
      total_failures, last_failure_at, last_success_at,
      timeout_at, opened_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW()
    )
    ON CONFLICT (service_id) DO UPDATE SET
      state = EXCLUDED.state,
      failure_count = EXCLUDED.failure_count,
      consecutive_failures = EXCLUDED.consecutive_failures,
      consecutive_successes = EXCLUDED.consecutive_successes,
      total_requests = EXCLUDED.total_requests,
      total_successes = EXCLUDED.total_successes,
      total_failures = EXCLUDED.total_failures,
      last_failure_at = COALESCE(EXCLUDED.last_failure_at, circuit_breaker_state.last_failure_at),
      last_success_at = COALESCE(EXCLUDED.last_success_at, circuit_breaker_state.last_success_at),
      timeout_at = EXCLUDED.timeout_at,
      opened_at = COALESCE(EXCLUDED.opened_at, circuit_breaker_state.opened_at),
      updated_at = NOW()
  `;

  try {
    await pool.query(query, [
      state.serviceId,
      state.state,
      state.failureCount,
      state.consecutiveFailures,
      state.consecutiveSuccesses,
      state.totalRequests,
      state.totalSuccesses,
      state.totalFailures,
      state.lastFailureAt,
      state.lastSuccessAt,
      state.timeoutAt,
      state.openedAt,
    ]);
    return [null, null];
  } catch (err) {
    return [err instanceof Error ? err : new Error(String(err)), null];
  }
}

async function loadCircuitBreakerState(
  pool: Pool,
  serviceId: string,
): Promise<Result<CBPersistedState | null>> {
  const query = `
    SELECT service_id, state, failure_count, consecutive_failures,
           consecutive_successes, total_requests, total_successes,
           total_failures, last_failure_at, last_success_at,
           timeout_at, opened_at
    FROM circuit_breaker_state
    WHERE service_id = $1
  `;

  try {
    const { rows } = await pool.query(query, [serviceId]);
    if (rows.length === 0) {
      return [null, null];
    }
    const row = rows[0];
    return [null, {
      serviceId: row.service_id as string,
      state: row.state as CBState,
      failureCount: row.failure_count as number,
      consecutiveFailures: row.consecutive_failures as number,
      consecutiveSuccesses: row.consecutive_successes as number,
      totalRequests: row.total_requests as bigint,
      totalSuccesses: row.total_successes as bigint,
      totalFailures: row.total_failures as bigint,
      lastFailureAt: row.last_failure_at as Date | null,
      lastSuccessAt: row.last_success_at as Date | null,
      timeoutAt: row.timeout_at as Date | null,
      openedAt: row.opened_at as Date | null,
    }];
  } catch (err) {
    return [err instanceof Error ? err : new Error(String(err)), null];
  }
}
```

### Circuit Breaker con Persistencia

```typescript
class PersistentCircuitBreaker {
  private cb: CircuitBreaker;

  constructor(
    private pool: Pool,
    private serviceId: string,
    settings: CBSettings,
  ) {
    this.cb = new CircuitBreaker({
      ...settings,
      onStateChange: (name, from, to, counts) => {
        void this.persistState(name, from, to, counts);
        settings.onStateChange?.(name, from, to, counts);
      },
    });
  }

  async execute<T>(fn: () => Promise<T>): Promise<Result<T>> {
    const result = await this.cb.execute(fn);
    await this.updateCounters();
    return result;
  }

  getState(): CBState {
    return this.cb.getState();
  }

  getCounts(): Readonly<CBCounts> {
    return this.cb.getCounts();
  }

  private async persistState(
    _name: string,
    _from: CBState,
    to: CBState,
    counts: CBCounts,
  ): Promise<void> {
    const timeoutAt = to === "open"
      ? new Date(Date.now() + 60_000)
      : null;
    const openedAt = to === "open" ? new Date() : null;

    await saveCircuitBreakerState(this.pool, {
      serviceId: this.serviceId,
      state: to,
      failureCount: counts.totalFailures,
      consecutiveFailures: counts.consecutiveFailures,
      consecutiveSuccesses: counts.consecutiveSuccesses,
      totalRequests: BigInt(counts.requests),
      totalSuccesses: BigInt(counts.totalSuccesses),
      totalFailures: BigInt(counts.totalFailures),
      lastFailureAt: counts.consecutiveFailures > 0 ? new Date() : null,
      lastSuccessAt: counts.consecutiveSuccesses > 0 ? new Date() : null,
      timeoutAt,
      openedAt,
    });
  }

  private async updateCounters(): Promise<void> {
    const counts = this.cb.getCounts();
    const state = this.cb.getState();

    if (state === "closed") {
      await this.pool.query(
        `INSERT INTO circuit_breaker_state (service_id, state, total_requests, total_successes, total_failures, consecutive_successes, consecutive_failures, last_success_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
         ON CONFLICT (service_id) DO UPDATE SET
           total_requests = circuit_breaker_state.total_requests + 1,
           total_successes = CASE WHEN $6 > 0 THEN circuit_breaker_state.total_successes + 1 ELSE circuit_breaker_state.total_successes END,
           total_failures = CASE WHEN $7 > 0 THEN circuit_breaker_state.total_failures + 1 ELSE circuit_breaker_state.total_failures END,
           consecutive_successes = $6,
           consecutive_failures = $7,
           last_success_at = CASE WHEN $6 > 0 THEN NOW() ELSE circuit_breaker_state.last_success_at END,
           updated_at = NOW()`,
        [this.serviceId, state, counts.requests, counts.totalSuccesses, counts.totalFailures, counts.consecutiveSuccesses, counts.consecutiveFailures],
      );
    }
  }
}
```

### Recovery After Restart

```typescript
async function initializeCircuitBreakers(
  pool: Pool,
  serviceIds: readonly string[],
): Promise<Result<Map<string, PersistentCircuitBreaker>>> {
  const breakers = new Map<string, PersistentCircuitBreaker>();

  for (const serviceId of serviceIds) {
    const breaker = new PersistentCircuitBreaker(pool, serviceId, {
      name: serviceId,
      maxRequests: 3,
      timeoutMs: 60_000,
      readyToTrip: (counts) => counts.consecutiveFailures >= 5,
    });
    breakers.set(serviceId, breaker);
  }

  return [null, breakers];
}

async function recoverCircuitBreakerStates(pool: Pool): Promise<Result<null>> {
  const query = `
    UPDATE circuit_breaker_state
    SET state = 'closed',
        consecutive_failures = 0,
        timeout_at = NULL
    WHERE state = 'open'
      AND timeout_at < NOW()
  `;

  try {
    await pool.query(query);
    return [null, null];
  } catch (err) {
    return [err instanceof Error ? err : new Error(String(err)), null];
  }
}
```

## Umbrales y Ventanas de Tiempo

### Configuración de Thresholds

```typescript
interface CBConfig {
  serviceId: string;
  maxRequests: number;
  timeoutMs: number;
  consecutiveFailures: number;
  failureRatio?: number;
  minRequests?: number;
}

const defaultConfigs: ReadonlyMap<string, CBConfig> = new Map([
  ["gcal", {
    serviceId: "gcal",
    maxRequests: 3,
    timeoutMs: 60_000,
    consecutiveFailures: 5,
  }],
  ["telegram", {
    serviceId: "telegram",
    maxRequests: 5,
    timeoutMs: 30_000,
    consecutiveFailures: 10,
  }],
  ["gmail", {
    serviceId: "gmail",
    maxRequests: 3,
    timeoutMs: 60_000,
    consecutiveFailures: 5,
  }],
  ["database", {
    serviceId: "database",
    maxRequests: 1,
    timeoutMs: 10_000,
    consecutiveFailures: 3,
  }],
]);

function createRatioBasedCircuitBreaker(config: CBConfig): CircuitBreaker {
  return new CircuitBreaker({
    name: config.serviceId,
    maxRequests: config.maxRequests,
    timeoutMs: config.timeoutMs,
    readyToTrip: (counts) => {
      const minReqs = config.minRequests ?? 0;
      if (counts.requests < minReqs) {
        return false;
      }
      if (config.failureRatio !== undefined && minReqs > 0) {
        const failureRatio = counts.totalFailures / counts.requests;
        return failureRatio >= config.failureRatio;
      }
      return counts.consecutiveFailures >= config.consecutiveFailures;
    },
  });
}
```

## Uso en Scripts Windmill

### Script: Circuit Breaker Check

```typescript
export async function main(
  serviceId: string,
): Promise<Result<Readonly<Record<string, unknown>>>> {
  const cb = getCircuitBreaker(serviceId);
  const state = cb.getState();
  const counts = cb.getCounts();

  return [null, {
    state,
    requests: counts.requests,
    total_successes: counts.totalSuccesses,
    total_failures: counts.totalFailures,
    consecutive_failures: counts.consecutiveFailures,
    consecutive_successes: counts.consecutiveSuccesses,
    is_open: state === "open",
  }];
}
```

### Script: Circuit Breaker Record

```typescript
export async function main(
  serviceId: string,
  success: boolean,
  errorMessage: string | null,
): Promise<Result<Readonly<Record<string, unknown>>>> {
  const pool = await getPool();

  if (success) {
    const [err] = await recordCircuitBreakerSuccess(pool, serviceId);
    if (err != null) return [err, null];
  } else {
    const [err] = await recordCircuitBreakerFailure(pool, serviceId, errorMessage ?? "unknown");
    if (err != null) return [err, null];
  }

  const [err, state] = await loadCircuitBreakerState(pool, serviceId);
  if (err != null) return [err, null];

  return [null, {
    service_id: serviceId,
    state: state?.state ?? "unknown",
    recorded: success,
  }];
}

async function recordCircuitBreakerSuccess(
  pool: Pool,
  serviceId: string,
): Promise<Result<null>> {
  const query = `
    INSERT INTO circuit_breaker_state (service_id, total_successes, consecutive_successes, consecutive_failures, last_success_at)
    VALUES ($1, 1, 1, 0, NOW())
    ON CONFLICT (service_id) DO UPDATE SET
      total_successes = circuit_breaker_state.total_successes + 1,
      consecutive_successes = circuit_breaker_state.consecutive_successes + 1,
      consecutive_failures = 0,
      last_success_at = NOW()
  `;
  try {
    await pool.query(query, [serviceId]);
    return [null, null];
  } catch (err) {
    return [err instanceof Error ? err : new Error(String(err)), null];
  }
}

async function recordCircuitBreakerFailure(
  pool: Pool,
  serviceId: string,
  errorMsg: string,
): Promise<Result<null>> {
  const query = `
    INSERT INTO circuit_breaker_state (
      service_id, total_failures, consecutive_failures,
      last_failure_at, state, timeout_at, opened_at
    ) VALUES ($1, 1, 1, NOW(), 'open', NOW() + INTERVAL '60 seconds', NOW())
    ON CONFLICT (service_id) DO UPDATE SET
      total_failures = circuit_breaker_state.total_failures + 1,
      consecutive_failures = circuit_breaker_state.consecutive_failures + 1,
      consecutive_successes = 0,
      last_failure_at = NOW(),
      state = CASE
        WHEN circuit_breaker_state.consecutive_failures + 1 >= 5
        THEN 'open'
        ELSE circuit_breaker_state.state
      END,
      timeout_at = CASE
        WHEN circuit_breaker_state.consecutive_failures + 1 >= 5
        THEN NOW() + INTERVAL '60 seconds'
        ELSE circuit_breaker_state.timeout_at
      END,
      opened_at = CASE
        WHEN circuit_breaker_state.consecutive_failures + 1 >= 5
        THEN NOW()
        ELSE circuit_breaker_state.opened_at
      END
    WHERE circuit_breaker_state.state != 'open'
  `;
  try {
    await pool.query(query, [serviceId]);
    return [null, null];
  } catch (err) {
    return [err instanceof Error ? err : new Error(String(err)), null];
  }
}
```

### Integración con Flows de Booking

```yaml
# f/booking-orchestrator-flow__flow/flow.yaml
value:
  modules:
    - id: check_gcal_circuit_breaker
      value:
        type: script
        path: f/circuit-breaker-check
        input_transforms:
          service_id:
            type: static
            value: "gcal"

    - id: gate_cb_open
      skip_if:
        expr: results.check_gcal_circuit_breaker.data?.state !== 'open'
      stop_after_if:
        expr: results.check_gcal_circuit_breaker.data?.state === 'open'
        error_message: "Google Calendar service unavailable (circuit breaker open)"
      value:
        type: rawscript
        language: bun
        content: |
          export async function main() {
            return { skip: false };
          }

    - id: gcal_create_event
      value:
        type: script
        path: f/gcal-create-event

    - id: record_gcal_success
      value:
        type: script
        path: f/circuit-breaker-record
        input_transforms:
          service_id:
            type: static
            value: "gcal"
          success:
            type: static
            value: true

    - id: failure
      value:
        type: rawscript
        language: bun
        content: |
          export async function main(error: Error) {
            await recordCircuitBreakerFailure("gcal", error.message);
            return { error: error.message };
          }
```

## Errores Comunes

### ❌ No Persistir Estado

```typescript
// MAL: Estado se pierde al reiniciar
const cb = new CircuitBreaker(settings);

// BIEN: Con persistencia
const pcb = new PersistentCircuitBreaker(pool, serviceId, settings);
```

### ❌ Timeout Muy Corto

```typescript
// MAL: 1 segundo no es suficiente para recuperación
const settings = { timeoutMs: 1_000, ...rest };

// BIEN: 60 segundos para servicios externos
const settings = { timeoutMs: 60_000, ...rest };
```

### ❌ Threshold Muy Bajo

```typescript
// MAL: 1 fallo y se abre (muy sensible)
readyToTrip: (counts) => counts.consecutiveFailures >= 1

// BIEN: 5 fallos consecutivos
readyToTrip: (counts) => counts.consecutiveFailures >= 5
```

### ❌ No Diferenciar Errores

```typescript
// MAL: Todo cuenta como fallo
isSuccessful: (err) => err === null

// BIEN: Ignorar errores de cliente (4xx)
isSuccessful: (err) => {
  if (err === null) return true;
  if (isClientError(err)) return true;
  return false;
}
```

## Métricas a Monitorear

| Métrica | Alerta Si | Acción |
|---------|-----------|--------|
| Estado OPEN | > 5 min | Investigar servicio |
| Failure Rate | > 20% | Revisar logs del servicio |
| Consecutive Failures | > 3 | Alerta temprana |
| State Transitions | > 10/hora | Inestabilidad del servicio |
| Timeout Expirations | > 5/hora | Servicio lento |

## Checklist Producción

- [ ] Circuit breaker por servicio externo (GCal, Telegram, etc.)
- [ ] Persistencia en PostgreSQL
- [ ] Recovery de estado al restart
- [ ] Thresholds configurados por servicio
- [ ] Logging de state changes
- [ ] Monitoreo de métricas (estado, failure rate)
- [ ] Alertas cuando CB se abre
- [ ] Documentación de thresholds y timeouts
- [ ] Runbook para reset manual si es necesario
- [ ] Testing de transiciones de estado
