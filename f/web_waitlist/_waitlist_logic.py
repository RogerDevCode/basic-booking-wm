# mypy: disable-error-code
from typing import Any
from datetime import datetime
from typing import List, Optional, Dict, Any, cast, Tuple
from ..internal._result import Result, DBClient, ok, fail
from ._waitlist_models import WaitlistEntry, WaitlistResult, InputSchema

async def resolve_client_id(db: DBClient, user_id: str, input_client_id: Optional[str]) -> Result[str]:
    try:
        rows = await db.fetch(
            """
            SELECT u.user_id, p.client_id FROM users u
            LEFT JOIN clients p ON p.client_id = u.user_id OR p.email = u.email
            WHERE u.user_id = $1::uuid LIMIT 1
            """,
            user_id
        )
        if not rows: return fail("user_not_found")
        
        row = rows[0]
        cid = str(row["client_id"]) if row.get("client_id") else (input_client_id or None)
        if not cid: return fail("client_record_not_found")
        return ok(cid)
    except Exception as e:
        return fail(f"identity_resolution_failed: {e}")

async def handle_join(db: DBClient, client_id: str, data: InputSchema) -> Result[WaitlistResult]:
    if not data.service_id: return fail("service_id_required")
    
    # Lock service
    res = await db.fetch("SELECT 1 FROM services WHERE service_id = $1::uuid FOR UPDATE", data.service_id)
    if not res: return fail("service_not_found")

    # Check existing
    rows = await db.fetch(
        """
        SELECT waitlist_id FROM waitlist
        WHERE client_id = $1::uuid AND service_id = $2::uuid AND status IN ('waiting', 'notified')
        LIMIT 1
        """,
        client_id, data.service_id
    )
    if rows: return fail("already_on_waitlist")

    # Count for position
    count_rows = await db.fetch("SELECT COUNT(*) as cnt FROM waitlist WHERE service_id = $1::uuid AND status = 'waiting'", data.service_id)
    position = int(count_rows[0]["cnt"]) + 1 if count_rows else 1

    # Insert
    ins = await db.fetch(
        """
        INSERT INTO waitlist (
            client_id, service_id, preferred_date,
            preferred_start_time, preferred_end_time,
            status, position
        ) VALUES ($1::uuid, $2::uuid, $3, $4, $5, 'waiting', $6)
        RETURNING waitlist_id
        """,
        client_id, data.service_id, data.preferred_date,
        data.preferred_start_time, data.preferred_end_time, position
    )
    if not ins: return fail("insert_failed")

    return ok({
        "entries": [],
        "position": position,
        "message": f"Joined waitlist at position {position}"
    })

async def handle_leave(db: DBClient, client_id: str, waitlist_id: Optional[str]) -> Result[WaitlistResult]:
    if not waitlist_id: return fail("waitlist_id_required")
    
    rows = await db.fetch(
        """
        UPDATE waitlist SET status = 'cancelled', updated_at = NOW()
        WHERE waitlist_id = $1::uuid AND client_id = $2::uuid AND status IN ('waiting', 'notified')
        RETURNING service_id
        """,
        waitlist_id, client_id
    )
    if rows:
        # Trigger recalculate (assuming PL/pgSQL function exists)
        await db.execute("SELECT recalculate_waitlist_positions($1::uuid)", str(rows[0]["service_id"]))
    
    return ok({"entries": [], "position": None, "message": "Left waitlist successfully"})

async def handle_list(db: DBClient, client_id: str) -> Result[WaitlistResult]:
    rows = await db.fetch(
        """
        SELECT waitlist_id, service_id, preferred_date,
               preferred_start_time, status, position, created_at
        FROM waitlist
        WHERE client_id = $1::uuid AND status IN ('waiting', 'notified')
        ORDER BY created_at DESC
        """,
        client_id
    )
    entries: List[WaitlistEntry] = []
    for r in rows:
        entries.append({
            "waitlist_id": str(r["waitlist_id"]),
            "service_id": str(r["service_id"]),
            "preferred_date": str(r["preferred_date"]) if r.get("preferred_date") else None,
            "preferred_start_time": str(r["preferred_start_time"]) if r.get("preferred_start_time") else None,
            "status": str(r["status"]),
            "position": int(r["position"]),
            "created_at": r["created_at"].isoformat() if isinstance(r.get("created_at"), datetime) else str(r.get("created_at"))
        })
    return ok({"entries": entries, "position": None, "message": "OK"})

async def handle_check_position(db: DBClient, client_id: str, waitlist_id: Optional[str]) -> Result[WaitlistResult]:
    if not waitlist_id: return fail("waitlist_id_required")
    rows = await db.fetch(
        "SELECT position FROM waitlist WHERE waitlist_id = $1::uuid AND client_id = $2::uuid LIMIT 1",
        waitlist_id, client_id
    )
    if not rows: return fail("entry_not_found")
    pos = int(rows[0]["position"])
    return ok({"entries": [], "position": pos, "message": f"Your position: {pos}"})
