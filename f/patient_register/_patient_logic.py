from typing import Any
from typing import Optional, List, Dict, Any, cast
from ..internal._result import Result, DBClient, ok, fail
from ._patient_models import InputSchema, ClientResult

async def upsert_client(db: DBClient, input_data: InputSchema) -> Result[ClientResult]:
    try:
        # 1. Try to find existing client by unique identifiers
        # Priority: Telegram > Email > Phone
        existing_id: Optional[str] = None
        
        if input_data.telegram_chat_id:
            rows = await db.fetch("SELECT client_id FROM clients WHERE telegram_chat_id = $1 LIMIT 1", input_data.telegram_chat_id)
            if rows: existing_id = str(rows[0]["client_id"])
            
        if not existing_id and input_data.email:
            rows = await db.fetch("SELECT client_id FROM clients WHERE email = $1 LIMIT 1", input_data.email)
            if rows: existing_id = str(rows[0]["client_id"])
            
        # 2. Update or Insert
        if existing_id:
            update_rows = await db.fetch(
                """
                UPDATE clients SET
                  name = $1,
                  email = COALESCE($2, email),
                  phone = COALESCE($3, phone),
                  telegram_chat_id = COALESCE($4, telegram_chat_id),
                  timezone = $5,
                  updated_at = NOW()
                WHERE client_id = $6::uuid
                RETURNING client_id, name, email, phone, telegram_chat_id, timezone
                """,
                input_data.name, input_data.email, input_data.phone, 
                input_data.telegram_chat_id, input_data.timezone, existing_id
            )
            created = False
            r = update_rows[0]
        else:
            insert_rows = await db.fetch(
                """
                INSERT INTO clients (name, email, phone, telegram_chat_id, timezone)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING client_id, name, email, phone, telegram_chat_id, timezone
                """,
                input_data.name, input_data.email, input_data.phone, 
                input_data.telegram_chat_id, input_data.timezone
            )
            created = True
            r = insert_rows[0]

        return ok({
            "client_id": str(r["client_id"]),
            "name": str(r["name"]),
            "email": str(r["email"]) if r.get("email") else None,
            "phone": str(r["phone"]) if r.get("phone") else None,
            "telegram_chat_id": str(r["telegram_chat_id"]) if r.get("telegram_chat_id") else None,
            "timezone": str(r["timezone"]),
            "created": created
        })

    except Exception as e:
        return fail(f"upsert_failed: {e}")
