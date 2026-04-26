from typing import Any
from datetime import datetime
from typing import List, Optional, Dict, Any, cast
from ..internal._result import Result, DBClient, ok, fail
from ._profile_models import ProfileResult, InputSchema

def map_to_profile(r: Dict[str, Any]) -> ProfileResult:
    return {
        "client_id": str(r["client_id"]),
        "name": str(r["name"]),
        "email": str(r["email"]) if r.get("email") else None,
        "phone": str(r["phone"]) if r.get("phone") else None,
        "telegram_chat_id": str(r["telegram_chat_id"]) if r.get("telegram_chat_id") else None,
        "timezone": str(r["timezone"]),
        "gcal_calendar_id": str(r["gcal_calendar_id"]) if r.get("gcal_calendar_id") else None,
    }

async def find_user(db: DBClient, user_id: str) -> Result[Dict[str, Any]]:
    try:
        rows = await db.fetch("SELECT * FROM users WHERE user_id = $1::uuid LIMIT 1", user_id)
        if not rows: return fail("User not found")
        return ok(dict(rows[0]))
    except Exception as e:
        return fail(f"DB_FETCH_ERROR (users): {e}")

async def find_or_create_client(db: DBClient, user_id: str, user: Dict[str, Any]) -> Result[Dict[str, Any]]:
    try:
        email = user.get("email")
        rows = await db.fetch("SELECT * FROM clients WHERE client_id = $1::uuid OR email = $2 LIMIT 1", user_id, email)
        if rows: return ok(dict(rows[0]))

        # Auto-create
        insert_rows = await db.fetch(
            """
            INSERT INTO clients (name, email, phone, telegram_chat_id, timezone)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
            """,
            user.get("full_name"), email, user.get("phone"), 
            user.get("telegram_chat_id"), user.get("timezone") or 'America/Mexico_City'
        )
        if not insert_rows: return fail("Failed to create client record")
        return ok(dict(insert_rows[0]))
    except Exception as e:
        return fail(f"DB_WRITE_ERROR (clients): {e}")

async def update_profile(db: DBClient, client_id: str, data: InputSchema) -> Result[Dict[str, Any]]:
    try:
        fields = []
        params = []
        idx = 1
        for field in ["name", "email", "phone", "timezone"]:
            val = getattr(data, field)
            if val is not None:
                fields.append(f"{field} = ${idx}")
                params.append(val)
                idx += 1
        
        if not fields:
            rows = await db.fetch("SELECT * FROM clients WHERE client_id = $1::uuid LIMIT 1", client_id)
            if not rows: return fail("Client not found")
            return ok(dict(rows[0]))

        params.append(client_id)
        query = f"UPDATE clients SET {', '.join(fields)}, updated_at = NOW() WHERE client_id = ${idx}::uuid RETURNING *"
        rows = await db.fetch(query, *params)
        if not rows: return fail("Update failed: client record missing after write")
        return ok(dict(rows[0]))
    except Exception as e:
        return fail(f"DB_UPDATE_ERROR (clients): {e}")
