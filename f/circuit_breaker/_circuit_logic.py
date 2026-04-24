from typing import Optional, cast
from datetime import datetime
from ..internal._result import DBClient
from ._circuit_models import CircuitState

async def get_state(db: DBClient, service_id: str) -> Optional[CircuitState]:
    rows = await db.fetch(
        """
        SELECT service_id, state, failure_count, success_count,
               failure_threshold, success_threshold, timeout_seconds,
               opened_at, half_open_at, last_failure_at, last_success_at,
               last_error_message
        FROM circuit_breaker_state
        WHERE service_id = $1
        LIMIT 1
        """,
        service_id
    )
    if not rows:
        return None
    
    r = rows[0]
    return {
        "service_id": str(r["service_id"]),
        "state": cast(Any, r["state"]),
        "failure_count": int(r["failure_count"]),
        "success_count": int(r["success_count"]),
        "failure_threshold": int(r["failure_threshold"]),
        "success_threshold": int(r["success_threshold"]),
        "timeout_seconds": int(r["timeout_seconds"]),
        "opened_at": r["opened_at"].isoformat() if isinstance(r.get("opened_at"), datetime) else str(r.get("opened_at")) if r.get("opened_at") else None,
        "half_open_at": r["half_open_at"].isoformat() if isinstance(r.get("half_open_at"), datetime) else str(r.get("half_open_at")) if r.get("half_open_at") else None,
        "last_failure_at": r["last_failure_at"].isoformat() if isinstance(r.get("last_failure_at"), datetime) else str(r.get("last_failure_at")) if r.get("last_failure_at") else None,
        "last_success_at": r["last_success_at"].isoformat() if isinstance(r.get("last_success_at"), datetime) else str(r.get("last_success_at")) if r.get("last_success_at") else None,
        "last_error_message": str(r["last_error_message"]) if r.get("last_error_message") else None,
    }

async def init_service(db: DBClient, service_id: str) -> None:
    await db.execute(
        """
        INSERT INTO circuit_breaker_state (service_id, state, failure_count, success_count)
        VALUES ($1, 'closed', 0, 0)
        ON CONFLICT (service_id) DO NOTHING
        """,
        service_id
    )

from typing import Any
