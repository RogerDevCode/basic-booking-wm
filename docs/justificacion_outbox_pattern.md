# Plan Definitivo: Eliminación de Desincronización Redis-Postgres

**Técnica Ralph: 3 iteraciones de auto-crítica convergente aplicadas.**  
**Iteración 1**: Plan Outbox → Red Team destruyó: ventana de inconsistencia, procesador no-atómico.  
**Iteración 2**: Plan Postgres-Primary → Red Team destruyó: race condition read-modify-write, cache staleness window.  
**Iteración 3**: Este documento. Incorpora los 3 patrones probados en producción por la comunidad Python/Postgres.

---

## Diagnóstico Raíz (Por Qué Fallan los Planes Anteriores)

El error fundamental de los planes 1 y 2 es que tratan Redis y Postgres como **dos fuentes de verdad que deben sincronizarse**. Cualquier arquitectura que escriba en dos datastores y luego intente reconciliarlos hereda el problema de los Generales Bizantinos: no hay protocolo finito que garantice consistencia sin un coordinador central.

**La solución canónica**: Postgres ES la única fuente de verdad. Redis NO almacena estado. Redis es un **caché de lectura con TTL** que se puede reconstruir en cualquier momento desde Postgres. Si Redis muere, se pierde rendimiento, no datos.

---

## Arquitectura Propuesta: Single-Writer + Advisory Lock + Write-Through Cache

```
┌─────────────────────────────────────────────────────────────┐
│                    WEBHOOK ENTRANTE                         │
│                                                             │
│  1. telegram_deduplicate (Redis SET NX update_id)           │
│  2. conversation_get:                                       │
│     ├─ Redis GET → HIT? → usar caché                        │
│     └─ MISS? → Postgres SELECT → devolver + SET Redis TTL   │
│  3. fsm_router (cómputo puro, sin I/O de estado)            │
│  4. conversation_commit:                                    │
│     ├─ pg_advisory_xact_lock(chat_id_hash)  ← serializa     │
│     ├─ UPDATE conversation_states SET ... WHERE version=$N  │
│     │  └─ 0 rows? → CONFLICT → retry o abort               │
│     ├─ INSERT INTO bookings (si aplica, misma TX)           │
│     ├─ Redis DEL booking:conv:{chat_id}  ← invalidar caché │
│     └─ COMMIT                                               │
│  5. send_telegram_response                                  │
└─────────────────────────────────────────────────────────────┘
```

### Tres Pilares Probados en Producción

| Pilar | Patrón | Garantía |
|:---|:---|:---|
| **1. Serialización** | `pg_advisory_xact_lock(chat_id_hash)` | Dos webhooks del mismo usuario NUNCA ejecutan la sección crítica en paralelo. El segundo espera. |
| **2. Optimistic Locking** | Columna `version INT` + `WHERE version = $old` | Si el advisory lock falla (edge case cross-node), el UPDATE detecta el conflicto y aborta sin corrupción. |
| **3. Cache-Aside con Invalidación** | Redis como caché TTL. Write = DELETE key. Read = fallback a Postgres. | No hay dual-write. Redis NUNCA tiene datos que Postgres no tiene. Cache miss = reconstrucción automática. |

---

## Plan de Implementación Detallado

### Paso 1: Migración de Base de Datos

```sql
-- filepath: migrations/021_conversation_states.sql

-- Tabla de estados conversacionales (Single Source of Truth)
CREATE TABLE IF NOT EXISTS conversation_states (
    chat_id      VARCHAR(255) PRIMARY KEY,
    booking_state JSONB NOT NULL DEFAULT '{"name": "idle"}'::jsonb,
    active_flow   VARCHAR(50),
    booking_draft JSONB,
    pending_data  JSONB DEFAULT '{}'::jsonb,
    message_id    BIGINT,
    version       INT NOT NULL DEFAULT 1,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Función para generar hash estable de chat_id para advisory locks
-- pg_advisory_xact_lock toma bigint, usamos hashtext() que retorna int4
CREATE OR REPLACE FUNCTION chat_id_lock_key(p_chat_id VARCHAR)
RETURNS INT AS $$
    SELECT hashtext(p_chat_id);
$$ LANGUAGE sql IMMUTABLE STRICT;

COMMENT ON TABLE conversation_states IS
    'Single source of truth for FSM conversation state. '
    'Redis is a TTL cache only. This table replaces the Redis-primary architecture.';
```

### Paso 2: Wrapper Transaccional con Advisory Lock (`_conversation_tx.py`)

Nuevo módulo interno que encapsula la serialización por chat_id. Este es el corazón de la solución.

```python
# filepath: f/internal/_conversation_tx.py
"""
Transactional conversation state manager.

Implements the three production-proven pillars:
1. pg_advisory_xact_lock for per-chat serialization
2. Optimistic locking via version column
3. Cache-aside with invalidation (Redis DEL on write)

Usage:
    async with conversation_lock(conn, chat_id) as state:
        # state.version is the current version
        # modify state fields
        state.booking_state = {"name": "idle"}
    # On exit: UPDATE with WHERE version=$old, DEL Redis key, COMMIT
"""
from __future__ import annotations

import json
import traceback
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any, Final

if TYPE_CHECKING:
    from collections.abc import AsyncIterator

    from ._result import DBClient

MODULE: Final[str] = "conversation_tx"


class ConversationConflictError(RuntimeError):
    """Raised when optimistic lock detects concurrent modification."""


@dataclass
class ConversationSnapshot:
    """Mutable snapshot of conversation state loaded from Postgres."""

    chat_id: str
    booking_state: dict[str, Any] = field(default_factory=lambda: {"name": "idle"})
    active_flow: str | None = None
    booking_draft: dict[str, Any] | None = None
    pending_data: dict[str, Any] = field(default_factory=dict)
    message_id: int | None = None
    version: int = 0
    is_new: bool = False


async def _read_state(conn: DBClient, chat_id: str) -> ConversationSnapshot:
    """Read current state from Postgres (inside advisory lock)."""
    row = await conn.fetchrow(
        "SELECT booking_state, active_flow, booking_draft, pending_data, "
        "message_id, version FROM conversation_states WHERE chat_id = $1",
        chat_id,
    )
    if not row:
        return ConversationSnapshot(chat_id=chat_id, is_new=True)

    return ConversationSnapshot(
        chat_id=chat_id,
        booking_state=json.loads(row["booking_state"])
            if isinstance(row["booking_state"], str)
            else dict(row["booking_state"]),
        active_flow=str(row["active_flow"]) if row["active_flow"] else None,
        booking_draft=json.loads(row["booking_draft"])
            if isinstance(row["booking_draft"], str) and row["booking_draft"]
            else (dict(row["booking_draft"]) if row["booking_draft"] else None),
        pending_data=json.loads(row["pending_data"])
            if isinstance(row["pending_data"], str)
            else dict(row["pending_data"] or {}),
        message_id=int(row["message_id"]) if row["message_id"] else None,
        version=int(row["version"]),
    )


async def _write_state(conn: DBClient, state: ConversationSnapshot) -> None:
    """Persist state to Postgres with optimistic locking."""
    now = datetime.now(UTC).isoformat()

    if state.is_new:
        await conn.execute(
            """
            INSERT INTO conversation_states
                (chat_id, booking_state, active_flow, booking_draft,
                 pending_data, message_id, version, updated_at)
            VALUES ($1, $2::jsonb, $3, $4::jsonb, $5::jsonb, $6, 1, $7::timestamptz)
            ON CONFLICT (chat_id) DO NOTHING
            """,
            state.chat_id,
            json.dumps(state.booking_state),
            state.active_flow,
            json.dumps(state.booking_draft) if state.booking_draft else None,
            json.dumps(state.pending_data),
            state.message_id,
            now,
        )
        return

    # Optimistic lock: WHERE version = $old_version
    result = await conn.execute(
        """
        UPDATE conversation_states
        SET booking_state = $1::jsonb,
            active_flow = $2,
            booking_draft = $3::jsonb,
            pending_data = $4::jsonb,
            message_id = $5,
            version = version + 1,
            updated_at = $6::timestamptz
        WHERE chat_id = $7 AND version = $8
        """,
        json.dumps(state.booking_state),
        state.active_flow,
        json.dumps(state.booking_draft) if state.booking_draft else None,
        json.dumps(state.pending_data),
        state.message_id,
        now,
        state.chat_id,
        state.version,
    )

    if result == "UPDATE 0":
        raise ConversationConflictError(
            f"Optimistic lock conflict for chat_id={state.chat_id} "
            f"at version={state.version}"
        )


async def read_conversation(conn: DBClient, chat_id: str) -> ConversationSnapshot:
    """
    Read conversation state. Postgres is the source of truth.
    Called by conversation_get.
    """
    return await _read_state(conn, chat_id)


async def commit_conversation(
    conn: DBClient,
    state: ConversationSnapshot,
    redis_client: object | None = None,
) -> None:
    """
    Persist state to Postgres (with optimistic lock) and invalidate Redis cache.
    Must be called INSIDE a transaction that already holds the advisory lock.
    """
    await _write_state(conn, state)

    # Cache invalidation: DELETE, not SET
    # Next read will miss cache and rebuild from Postgres
    if redis_client is not None:
        try:
            await redis_client.delete(f"booking:conv:{state.chat_id}")  # type: ignore[union-attr]
        except Exception as e:
            from ._wmill_adapter import log
            log("REDIS_CACHE_INVALIDATION_FAILED", chat_id=state.chat_id,
                error=str(e), module=MODULE)
            # Non-fatal: cache will expire via TTL
```

### Paso 3: Modificación de `conversation_get` (Lectura Cache-Aside)

La lectura intenta Redis primero (caché). Si miss, reconstruye desde Postgres y rellena el caché.

```python
# filepath: f/internal/conversation_get/main.py (cambios clave)

async def _get_conversation(chat_id: str, redis_url: str | None = None,
                            pg_url: str | None = None) -> ConversationGetResult:
    redis = await create_redis_client(redis_url)
    try:
        key = f"booking:conv:{chat_id}"
        raw = await redis.get(key)
        if raw:
            # Cache HIT — parse y devolver
            data = json.loads(str(raw))
            # ... normalización Lua existente ...
            return ConversationGetResult(data=ConversationState(...))
    except Exception:
        pass  # Redis down → fallback silencioso a Postgres
    finally:
        await redis.aclose()

    # Cache MISS o Redis down → reconstruir desde Postgres
    conn = await create_db_client(pg_url)
    try:
        from .._conversation_tx import read_conversation
        snapshot = await read_conversation(conn, chat_id)

        state = ConversationState(
            chat_id=chat_id,
            booking_state=snapshot.booking_state,
            active_flow=snapshot.active_flow,
            booking_draft=snapshot.booking_draft,
            pending_data=snapshot.pending_data,
            message_id=snapshot.message_id,
            updated_at=datetime.now(UTC).isoformat(),
        )

        # Relleno de caché (write-through síncrono en lectura)
        try:
            redis2 = await create_redis_client(redis_url)
            await redis2.set(key, json.dumps(state.model_dump()), ex=REDIS_TTL)
            await redis2.aclose()
        except Exception:
            pass  # Cache fill failure is non-fatal

        return ConversationGetResult(data=state)
    finally:
        await conn.close()
```

### Paso 4: Modificación de `conversation_update` (Escritura Atómica)

La escritura adquiere el advisory lock, hace UPDATE con optimistic locking, e invalida el caché.

```python
# filepath: f/internal/conversation_update/main.py (cambios clave)

async def _update_conversation(input_data: ConversationUpdateInput,
                               redis_url: str | None = None,
                               pg_url: str | None = None) -> ConversationUpdateResult:
    conn = await create_db_client(pg_url)
    redis = await create_redis_client(redis_url)

    try:
        # BEGIN transacción + advisory lock por chat_id
        await conn.execute("BEGIN")
        await conn.execute(
            "SELECT pg_advisory_xact_lock(chat_id_lock_key($1))",
            input_data.chat_id
        )

        # Leer estado actual DENTRO del lock (serializado)
        from .._conversation_tx import read_conversation, commit_conversation
        state = await read_conversation(conn, input_data.chat_id)

        # Aplicar modificaciones
        if input_data.booking_state is not None:
            state.booking_state = input_data.booking_state
        if input_data.active_flow is not None:
            state.active_flow = input_data.active_flow
        if input_data.booking_draft is not None:
            state.booking_draft = input_data.booking_draft
        if input_data.pending_data is not None:
            state.pending_data = {**state.pending_data, **input_data.pending_data}
        if input_data.message_id is not None:
            state.message_id = input_data.message_id

        # Persistir con optimistic lock + invalidar caché
        await commit_conversation(conn, state, redis)

        await conn.execute("COMMIT")
        return ConversationUpdateResult(success=True, chat_id=input_data.chat_id)

    except Exception as e:
        try:
            await conn.execute("ROLLBACK")
        except Exception:
            pass
        raise RuntimeError(f"conversation_update failed: {e}") from e
    finally:
        await conn.close()
        await redis.aclose()
```

### Paso 5: Modificación de `booking_confirm` (Cita + Estado en Misma TX)

La confirmación de cita y la transición a `idle` ocurren en **la misma transacción SQL**.

```python
# filepath: f/internal/booking_confirm/main.py (cambios clave en _confirm_booking_core)

async def _confirm_booking_core(conn: DBClient, ...) -> BookingConfirmOutput:
    # Advisory lock: serializa todas las operaciones de este chat_id
    await conn.execute(
        "SELECT pg_advisory_xact_lock(chat_id_lock_key($1))", chat_id
    )

    # Leer estado actual (serializado por el lock)
    from .._conversation_tx import read_conversation, commit_conversation
    state = await read_conversation(conn, chat_id)

    # Guardia: solo confirmar si el FSM está realmente en "confirming"
    if state.booking_state.get("name") != "confirming":
        log("CONFIRM_SKIPPED_NOT_IN_CONFIRMING",
            actual_state=state.booking_state.get("name"), module=MODULE)
        return BookingConfirmOutput(
            success=False,
            error="not_in_confirming_state",
            user_message="Tu sesión ha cambiado. Vuelve a intentar."
        )

    # Insertar cita en la misma transacción (ya dentro de with_tenant_context)
    result = await repo.insert_booking(input_data)

    # Transicionar FSM a idle (misma transacción)
    state.booking_state = {"name": "idle"}
    state.active_flow = None
    state.booking_draft = None
    state.pending_data = {"router_handled": True, "user_id": client_id}
    await commit_conversation(conn, state, redis_client)

    # Si llegamos aquí, COMMIT del with_tenant_context
    # persiste AMBOS: la cita Y el estado idle atómicamente.
    return BookingConfirmOutput(success=True, ...)
```

### Paso 6: Modificación de `flow.yaml` (Simplificación)

Remover la lógica de rollback condicional de JS en `update_conversation_state`. Ahora que `booking_commit` actualiza el estado dentro de su propia transacción, el paso `update_conversation_state` solo necesita persistir los estados de las transiciones normales (no de confirmación).

```yaml
# Cambio en update_conversation_state: remover condicionales de booking_commit
args:
  type: javascript
  expr: >-
    { "chat_id": results.webhook_trigger.chat_id,
      "booking_state": results.fsm_router?.data?.nextState
        || results.conversational_router?.data?.nextState,
      "active_flow": results.fsm_router?.data?.active_flow || null,
      "booking_draft": results.fsm_router?.data?.nextDraft ?? null,
      "pending_data": {
        "router_handled": results.fsm_router?.data?.handled
          || results.conversational_router?.data?.handled,
        "text_kind": results.webhook_trigger.text_kind,
        "user_id": results.telegram_auto_register?.user_id || null,
        "client_id": results.telegram_auto_register?.client_id || null
      } }
```

Y agregar `pg_url` como entrada del step:
```yaml
  pg_url:
    type: javascript
    expr: variable("u/admin/DATABASE_URL")
```

---

## Respuesta a Cada Crítica del Red Team

| # | Crítica | Estado | Resolución |
|:--|:--------|:-------|:-----------|
| CRITICAL 1 | Race condition read-modify-write | **CERRADA** | `pg_advisory_xact_lock` serializa TODAS las operaciones de un chat_id. Dentro del lock: READ → MODIFY → WRITE es atómico. |
| HIGH 2 | Cache staleness window | **CERRADA** | Redis es caché TTL-only. Write = `DELETE` key (invalidación). Read = fallback a Postgres si miss. No hay ventana: Postgres siempre tiene la verdad. |
| MEDIUM 3 | Falta de transacciones explícitas | **CERRADA** | `BEGIN` + `pg_advisory_xact_lock` + `UPDATE WHERE version=$N` + `COMMIT`. Rollback explícito en cualquier fallo. |
| LOW 4 | Long-running transactions | **CERRADA** | No hay llamadas externas (APIs, GCal) dentro de la transacción. Solo SQL local. Duración estimada: <10ms. |
| CRITICAL (Plan 1) | Ventana de inconsistencia Outbox | **ELIMINADA** | No hay Outbox. No hay procesador asíncrono. No hay dual-write. |
| HIGH (Plan 1) | Procesador no-atómico | **ELIMINADA** | No hay procesador. |
| HIGH (Plan 1) | Circuit breaker Redis | **N/A** | Redis es caché opcional. Si cae, el sistema opera al 100% sobre Postgres. |
| MEDIUM (Plan 1) | Bloat de índices Outbox | **ELIMINADA** | No hay tabla Outbox. |
| MEDIUM (Plan 1) | Doble webhook | **MITIGADA** | `telegram_deduplicate` con `SET NX update_id` + advisory lock per-chat previene procesamiento concurrente del mismo usuario. |
| LOW (Plan 1) | ORDER BY created_at DESC | **ELIMINADA** | No hay lecturas de Outbox. Una sola fila por chat_id en `conversation_states`. |

---

## Plan de Verificación

### Test 1: Atomicidad Booking + Estado (Zero Split-Brain)
- Forzar un fallo de constraint UNIQUE en `bookings` (slot duplicado).
- Verificar que la transacción haga ROLLBACK completo.
- Verificar que `conversation_states` mantenga `confirming` (no mutó a `idle`).

### Test 2: Serialización por Chat (Zero Race Condition)
- Lanzar 2 webhooks concurrentes para el mismo `chat_id`.
- Verificar que el segundo espere al primero (advisory lock).
- Verificar que `version` se incremente exactamente 2 veces, no 1.

### Test 3: Resiliencia ante Caída de Redis (Zero Downtime)
- Apagar Redis (`docker compose stop redis`).
- Enviar mensajes al bot.
- Verificar que `conversation_get` retorne estados correctos desde Postgres.
- Verificar que `conversation_update` persista en Postgres sin error.
- Levantar Redis y verificar que la siguiente lectura rellene el caché.

### Test 4: Optimistic Lock Conflict (Zero Lost Updates)
- Dentro de un test, leer el estado con `version=5`.
- Modificar el estado directamente en Postgres (simulando otro proceso) incrementando version a 6.
- Intentar `commit_conversation` con `version=5`.
- Verificar que lance `ConversationConflictError`.
