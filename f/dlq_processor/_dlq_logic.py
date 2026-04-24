import json
from datetime import datetime
from typing import List, Optional, Dict, Any, cast
from ..internal._result import Result, DBClient, ok, fail
from ._dlq_models import DLQEntry, DLQListResult

def map_row_to_dlq_entry(r: Dict[str, Any]) -> DLQEntry:
    return {
        "dlq_id": int(r["dlq_id"]),
        "booking_id": str(r["booking_id"]) if r.get("booking_id") else None,
        "provider_id": str(r["provider_id"]) if r.get("provider_id") else None,
        "service_id": str(r["service_id"]) if r.get("service_id") else None,
        "failure_reason": str(r["failure_reason"]),
        "last_error_message": str(r["last_error_message"]),
        "last_error_stack": str(r["last_error_stack"]) if r.get("last_error_stack") else None,
        "original_payload": r["original_payload"] if isinstance(r.get("original_payload"), dict) else json.loads(r["original_payload"]) if r.get("original_payload") else {},
        "idempotency_key": str(r["idempotency_key"]),
        "status": cast(Any, r["status"]),
        "created_at": r["created_at"].isoformat() if isinstance(r.get("created_at"), datetime) else str(r.get("created_at")),
        "updated_at": r["updated_at"].isoformat() if isinstance(r.get("updated_at"), datetime) else str(r.get("updated_at")),
        "resolved_at": r["resolved_at"].isoformat() if isinstance(r.get("resolved_at"), datetime) else str(r.get("resolved_at")) if r.get("resolved_at") else None,
        "resolved_by": str(r["resolved_by"]) if r.get("resolved_by") else None,
        "resolution_notes": str(r["resolution_notes"]) if r.get("resolution_notes") else None,
    }

async def list_dlq(db: DBClient, status_filter: Optional[str]) -> Result[DLQListResult]:
    status = status_filter if status_filter in ['pending', 'resolved', 'discarded'] else 'pending'
    rows = await db.fetch(
        """
        SELECT * FROM booking_dlq
        WHERE status = $1
        ORDER BY created_at ASC
        LIMIT 100
        """,
        status
    )
    entries = [map_row_to_dlq_entry(r) for r in rows]
    return ok({"entries": entries, "total": len(entries)})

async def retry_dlq(db: DBClient, dlq_id: Optional[int]) -> Result[Dict[str, Any]]:
    if dlq_id is None:
        # Batch retry: Mark top 10 pending as updated to trigger potential reprocessing
        rows = await db.fetch(
            """
            SELECT dlq_id FROM booking_dlq
            WHERE status = 'pending'
            ORDER BY created_at ASC
            LIMIT 10
            FOR UPDATE SKIP LOCKED
            """
        )
        retried_ids = []
        for r in rows:
            await db.execute(
                "UPDATE booking_dlq SET updated_at = NOW() WHERE dlq_id = $1",
                r["dlq_id"]
            )
            retried_ids.append(int(r["dlq_id"]))
        return ok({"retried": retried_ids, "count": len(retried_ids)})

    # Single retry
    rows = await db.fetch(
        "SELECT dlq_id FROM booking_dlq WHERE dlq_id = $1 AND status = 'pending' FOR UPDATE",
        dlq_id
    )
    if not rows:
        return fail(f"dlq_entry_not_found_or_not_pending: ID {dlq_id}")

    await db.execute("UPDATE booking_dlq SET updated_at = NOW() WHERE dlq_id = $1", dlq_id)
    return ok({"retried": [dlq_id]})

async def resolve_dlq(db: DBClient, dlq_id: int, resolved_by: Optional[str], notes: Optional[str]) -> Result[Dict[str, int]]:
    # Execute update
    res = await db.execute(
        """
        UPDATE booking_dlq
        SET status = 'resolved',
            resolved_at = NOW(),
            resolved_by = $1,
            resolution_notes = $2,
            updated_at = NOW()
        WHERE dlq_id = $3
        """,
        resolved_by, notes, dlq_id
    )
    # asyncpg execute returns a command tag like "UPDATE 1"
    if "UPDATE 1" not in res:
        return fail(f"dlq_entry_not_found: ID {dlq_id}")
    return ok({"resolved": dlq_id})

async def discard_dlq(db: DBClient, dlq_id: int, notes: Optional[str]) -> Result[Dict[str, int]]:
    res = await db.execute(
        """
        UPDATE booking_dlq
        SET status = 'discarded',
            resolved_at = NOW(),
            resolution_notes = $1,
            updated_at = NOW()
        WHERE dlq_id = $2
        """,
        notes or "Discarded manually", dlq_id
    )
    if "UPDATE 1" not in res:
        return fail(f"dlq_entry_not_found: ID {dlq_id}")
    return ok({"discarded": dlq_id})

async def get_dlq_status_stats(db: DBClient) -> Result[Dict[str, int]]:
    rows = await db.fetch("SELECT status, COUNT(*) as count FROM booking_dlq GROUP BY status")
    stats = {str(r["status"]): int(r["count"]) for r in rows}
    return ok(stats)
