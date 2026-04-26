from typing import Any
from datetime import datetime
from typing import List, Optional, Dict, Any, cast, Union
from ..internal._result import Result, DBClient, ok, fail
from ._user_models import UserInfo, UsersListResult, InputSchema

def map_row(r: Dict[str, Any]) -> UserInfo:
    return {
        "user_id": str(r["user_id"]),
        "full_name": str(r["full_name"]),
        "email": str(r["email"]) if r.get("email") else None,
        "rut": str(r["rut"]) if r.get("rut") else None,
        "phone": str(r["phone"]) if r.get("phone") else None,
        "role": str(r["role"]),
        "is_active": bool(r["is_active"]),
        "telegram_chat_id": str(r["telegram_chat_id"]) if r.get("telegram_chat_id") else None,
        "last_login": r["last_login"].isoformat() if isinstance(r.get("last_login"), datetime) else str(r.get("last_login")) if r.get("last_login") else None,
        "created_at": r["created_at"].isoformat() if isinstance(r.get("created_at"), datetime) else str(r.get("created_at")),
    }

async def handle_user_actions(db: DBClient, input_data: InputSchema) -> Result[Union[UserInfo, UsersListResult]]:
    action = input_data.action
    
    if action == 'list':
        rows = await db.fetch(
            """
            SELECT user_id, full_name, email, rut, phone, role, is_active,
                   telegram_chat_id, last_login, created_at
            FROM users
            ORDER BY created_at DESC
            LIMIT 200
            """
        )
        users = [map_row(r) for r in rows]
        count_rows = await db.fetch("SELECT COUNT(*) AS total FROM users")
        total = int(count_rows[0]["total"]) if count_rows else 0
        return ok({"users": users, "total": total})

    if not input_data.target_user_id:
        return fail(f"{action}_failed: target_user_id is required")

    if action == 'get':
        rows = await db.fetch(
            "SELECT * FROM users WHERE user_id = $1::uuid LIMIT 1",
            input_data.target_user_id
        )
        if not rows: return fail("User not found")
        return ok(map_row(rows[0]))

    elif action == 'update':
        fields = []
        params = []
        idx = 1
        for field in ["full_name", "email", "phone", "role"]:
            val = getattr(input_data, field)
            if val is not None:
                fields.append(f"{field} = ${idx}")
                params.append(val)
                idx += 1
        
        if not fields: return fail("update_failed: no fields provided")
        
        params.append(input_data.target_user_id)
        query = f"UPDATE users SET {', '.join(fields)}, updated_at = NOW() WHERE user_id = ${idx}::uuid RETURNING *"
        rows = await db.fetch(query, *params)
        if not rows: return fail("User not found")
        return ok(map_row(rows[0]))

    elif action == 'activate' or action == 'deactivate':
        active = (action == 'activate')
        rows = await db.fetch(
            "UPDATE users SET is_active = $1, updated_at = NOW() WHERE user_id = $2::uuid RETURNING *",
            active, input_data.target_user_id
        )
        if not rows: return fail("User not found")
        return ok(map_row(rows[0]))

    return fail(f"Unsupported action: {action}")
